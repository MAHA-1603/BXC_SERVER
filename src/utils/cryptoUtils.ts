import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
} from "crypto";

const AES_ALGORITHM = "aes-256-gcm";
const AES_IV_BYTES = 12; // 96-bit IV
const AES_TAG_BYTES = 16; // 128-bit auth tag

// Ensure we have a secure 32-byte key derived from our environment secrets
// Using JWT_SECRET as base to derive the AES key
const SECRET_BASE = process.env.JWT_SECRET || "default_unsafe_secret";
// Use a fixed salt for deterministic derivation so the key is consistent across restarts
const SALT = "bxc_doc_encryption_salt_2026";
const aesKey = scryptSync(SECRET_BASE, SALT, 32); // 32 bytes = 256 bits

/**
 * Encrypts a URL
 * @param url The plain R2/S3 URL
 * @returns Base64URL encoded encrypted string
 */
export function encryptDocumentUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("ENC:")) return url; // Already encrypted

  const iv = randomBytes(AES_IV_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, aesKey, iv);

  const encrypted = Buffer.concat([
    cipher.update(url, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext
  const combined = `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;

  // Return with ENC: prefix and base64url string
  return "ENC:" + Buffer.from(combined).toString("base64url");
}

import { generatePresignedGetUrl } from "../storage/r2-presigner";

/**
 * Decrypts the encrypted URL string and returns a presigned GET URL
 * @param token The encrypted URL string (with or without ENC: prefix)
 * @returns Presigned URL valid for 7 days
 */
export async function decryptDocumentUrl(token: string): Promise<string> {
  try {
    if (!token) return token;

    let decrypted = token;

    // 1. Decrypt if it has ENC: prefix
    if (token.startsWith("ENC:")) {
      const cleanToken = token.substring(4);
      const combined = Buffer.from(cleanToken, "base64url").toString("utf8");
      const parts = combined.split(":");

      if (parts.length === 3) {
        const [ivHex, authTagHex, ciphertextHex] = parts;
        const iv = Buffer.from(ivHex, "hex");
        const authTag = Buffer.from(authTagHex, "hex");
        const ciphertext = Buffer.from(ciphertextHex, "hex");

        const decipher = createDecipheriv(AES_ALGORITHM, aesKey, iv);
        decipher.setAuthTag(authTag);

        decrypted = Buffer.concat([
          decipher.update(ciphertext),
          decipher.final(),
        ]).toString("utf8");
      }
    }

    // 2. Identify if it's an R2 URL (either the custom domain or the R2 endpoint)
    // and extract the key to generate a FRESH presigned URL
    const domain = process.env.R2_PUBLIC_DOMAIN || "";
    const r2Endpoint = `${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;

    let key: string | null = null;

    try {
      const urlObj = new URL(decrypted);

      // Check if it matches our custom domain
      if (domain && decrypted.startsWith(domain)) {
        // Pathname usually starts with /
        key = urlObj.pathname.startsWith("/") ? urlObj.pathname.substring(1) : urlObj.pathname;
      }
      // Check if it's an R2 storage URL (might happen if stored directly)
      else if (urlObj.hostname.includes("r2.cloudflarestorage.com")) {
        const pathParts = urlObj.pathname.split("/").filter(Boolean);
        const bucketName = process.env.CLOUDFLARE_BUCKET || "";
        
        // If the first part of the path is the bucket name, skip it to get the key
        if (bucketName && pathParts[0] === bucketName) {
          key = pathParts.slice(1).join("/");
        } else {
          // In virtual-hosted style (bucket in subdomain), the entire path is the key
          key = pathParts.join("/");
        }
      }
    } catch (e) {
      // Not a valid URL, maybe it's just the key? 
      // If it looks like a path, treat it as a key
      if (decrypted.includes("/") && !decrypted.startsWith("http")) {
        key = decrypted;
      }
    }

    if (key) {
      console.log(`[DEBUG] Decrypted: ${decrypted.substring(0, 30)}... Extracted Key: ${key}`);
      // Generate a fresh presigned URL valid for 7 days
      return await generatePresignedGetUrl(key);
    }

    return decrypted;
  } catch (error) {
    console.error("Failed to decrypt or presign document url:", error);
    return token;
  }
}

/**
 * Helper to decrypt document URLs in a user object.
 * Mutates and returns the object.
 */
export async function decryptUserDocuments<T extends Record<string, any>>(user: T): Promise<T> {
  if (!user) return user;
  const documentFields = ["panDocumentUrl", "cinDocumentUrl", "gstDocumentUrl"];
  for (const field of documentFields) {
    if (user[field]) {
      (user as any)[field] = await decryptDocumentUrl(user[field]);
    }
  }
  return user;
}
