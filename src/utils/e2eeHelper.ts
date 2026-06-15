/**
 * e2eeHelper.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hybrid End-to-End Encryption helpers for BXC Chat.
 *
 * ┌─ Scheme ────────────────────────────────────────────────────────────────┐
 * │  Asymmetric : RSA-OAEP-SHA256 (2048-bit) — per-user key pair           │
 * │  Symmetric  : AES-128-GCM — 128-bit session key generated per message   │
 * │                                                                          │
 * │  Send flow:                                                              │
 * │    1. Generate random 128-bit (16-byte) AES session key                  │
 * │    2. Encrypt plaintext  with AES-128-GCM  → encryptedContent            │
 * │    3. Encrypt session key with recipient's RSA public key (RSA-OAEP)     │
 * │         → encryptedKey  (base64)                                         │
 * │    4. Store both in DB — the server is the only entity with private keys  │
 * │                                                                          │
 * │  Receive flow:                                                           │
 * │    1. Decrypt encryptedKey  with recipient's RSA private key → AES key   │
 * │    2. Decrypt encryptedContent with AES key → plaintext                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Key size security:
 *   RSA-2048 ≈ 112-bit security (widely accepted, NIST-approved until 2030+)
 *   AES-128  = exactly 128-bit security
 *
 * No external packages — uses Node.js built-in `crypto` module.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  generateKeyPairSync,
  publicEncrypt,
  privateDecrypt,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  constants,
} from "crypto";

// ─── Constants ────────────────────────────────────────────────────────────────
const RSA_MODULUS_LENGTH = 2048;         // RSA key size in bits
const AES_ALGORITHM      = "aes-128-gcm";
const AES_KEY_BYTES      = 16;           // 128 bits
const AES_IV_BYTES       = 12;           // 96-bit IV — optimal for GCM
const AES_TAG_BYTES      = 16;           // 128-bit auth tag

// RSA-OAEP options (same on both encrypt & decrypt)
const OAEP_OPTIONS = {
  key: "",                               // filled at call-site
  padding: constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: "sha256",
} as const;

// ─── RSA key-pair generation ──────────────────────────────────────────────────

/**
 * Generate a fresh RSA-2048 key pair for a new user.
 * Returns PEM-encoded publicKey and privateKey strings.
 * Called once at registration and stored in User.publicKey / User.privateKey.
 */
export function generateUserKeyPair(): {
  publicKey: string;
  privateKey: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: RSA_MODULUS_LENGTH,
    publicKeyEncoding: { type: "pkcs1", format: "pem" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });

  // Strip headers and newlines to keep only the raw Base64 string
  const strip = (pem: string) => pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "")
    .trim();

  return {
    publicKey: strip(publicKey),
    privateKey: strip(privateKey),
  };
}

// ─── AES-128-GCM helpers ──────────────────────────────────────────────────────

/**
 * Encrypt plaintext with AES-128-GCM.
 * Returns a colon-delimited hex string: `<iv>:<authTag>:<ciphertext>`
 */
function aesEncrypt(plaintext: string, aesKey: Buffer): string {
  const iv = randomBytes(AES_IV_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, aesKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt AES-128-GCM ciphertext produced by aesEncrypt().
 */
function aesDecrypt(payload: string, aesKey: Buffer): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("[E2EE] Malformed AES payload — expected iv:authTag:ciphertext");
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv         = Buffer.from(ivHex,         "hex");
  const authTag    = Buffer.from(authTagHex,    "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = createDecipheriv(AES_ALGORITHM, aesKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// ─── Public E2EE API ──────────────────────────────────────────────────────────

/**
 * Encrypt a chat message for a specific recipient.
 *
 * @param plaintext        - Original message text.
 * @param recipientPubKey  - PEM-encoded RSA-2048 public key of the recipient.
 * @returns Object containing:
 *   - encryptedContent : AES-128-GCM ciphertext stored in Message.content
 *   - encryptedKey     : AES session key encrypted with recipient's RSA public key (base64),
 *                        stored in Message.encryptedKey
 */
export function encryptMessage(
  plaintext: string,
  recipientPubKey: string
): { encryptedContent: string; encryptedKey: string } {
  if (!plaintext) {
    return { encryptedContent: "", encryptedKey: "" };
  }

  // 1. Generate a random 128-bit AES session key
  const aesKey = randomBytes(AES_KEY_BYTES);

  // 2. Encrypt message with AES-128-GCM
  const encryptedContent = aesEncrypt(plaintext, aesKey);

  // Re-add PEM headers if they were stripped
  const formattedPubKey = recipientPubKey.includes("BEGIN RSA PUBLIC KEY")
    ? recipientPubKey
    : `-----BEGIN RSA PUBLIC KEY-----\n${recipientPubKey}\n-----END RSA PUBLIC KEY-----`;

  // 3. Encrypt AES session key with recipient's RSA-2048 public key (OAEP)
  const encryptedKey = publicEncrypt(
    {
      key: formattedPubKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    aesKey
  ).toString("base64");

  return { encryptedContent, encryptedKey };
}

/**
 * Decrypt a chat message using the recipient's RSA private key.
 *
 * @param encryptedContent - AES-128-GCM ciphertext from Message.content
 * @param encryptedKey     - Base64 RSA-encrypted AES key from Message.encryptedKey
 * @param recipientPrivKey - PEM-encoded RSA-2048 private key of the recipient.
 * @returns Original plaintext string.
 */
export function decryptMessage(
  encryptedContent: string,
  encryptedKey: string,
  recipientPrivKey: string
): string {
  if (!encryptedContent) return encryptedContent;

  // Backward compatibility: if no encryptedKey, content is plain legacy text
  if (!encryptedKey) {
    return encryptedContent;
  }

  // Re-add PEM headers if they were stripped
  const formattedPrivKey = recipientPrivKey.includes("BEGIN RSA PRIVATE KEY")
    ? recipientPrivKey
    : `-----BEGIN RSA PRIVATE KEY-----\n${recipientPrivKey}\n-----END RSA PRIVATE KEY-----`;

  // 1. Decrypt the AES session key with the recipient's RSA private key
  const aesKey = privateDecrypt(
    {
      key: formattedPrivKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(encryptedKey, "base64")
  );

  // 2. Decrypt the message content with the recovered AES-128 key
  return aesDecrypt(encryptedContent, aesKey);
}

/**
 * Detect whether a stored message is an E2EE-encrypted payload.
 * Useful for backward compatibility with legacy plain-text messages.
 */
export function isEncrypted(content: string, encryptedKey?: string | null): boolean {
  if (!content || !encryptedKey) return false;
  const parts = content.split(":");
  return (
    parts.length === 3 &&
    parts[0].length === AES_IV_BYTES * 2 &&  // 24 hex chars
    parts[1].length === AES_TAG_BYTES * 2    // 32 hex chars
  );
}
