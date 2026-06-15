import { prisma } from "../../config/database";
import type { Prisma } from "@prisma/client";
import {
  encryptMessage,
  decryptMessage,
  generateUserKeyPair,
  isEncrypted,
} from "../../utils/e2eeHelper";

// ─────────────────────────────────────────────────────────────────────────────
// Internal: get (or lazily generate) RSA key pair for a user.
// Key pair is generated once per user on first chat usage if not already set.
// ─────────────────────────────────────────────────────────────────────────────
async function ensureUserKeys(userId: string): Promise<{ publicKey: string; privateKey: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { publicKey: true, privateKey: true },
  });

  if (!user) throw new Error("User not found");

  if (user.publicKey && user.privateKey) {
    return { publicKey: user.publicKey, privateKey: user.privateKey };
  }

  // Generate RSA-2048 key pair and persist
  const { publicKey, privateKey } = generateUserKeyPair();
  await prisma.user.update({
    where: { id: userId },
    data: { publicKey, privateKey },
  });

  console.log(`[E2EE] Generated RSA-2048 key pair for user ${userId}`);
  return { publicKey, privateKey };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal: resolve who the other participant is in a conversation.
// ─────────────────────────────────────────────────────────────────────────────
async function resolveConversationParticipants(
  conversationId: string,
  currentUserId: string
): Promise<{ applicantId: string; postOwnerId: string; otherUserId: string }> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      application: {
        include: {
          applicant: { select: { id: true } },
          providerPost: { select: { userId: true } },
          seekerPost: { select: { userId: true } },
        },
      },
    },
  });

  if (!conversation?.application) throw new Error("Conversation not found");

  const applicantId = conversation.application.applicantId;
  const postOwnerId =
    conversation.application.providerPost?.userId ||
    conversation.application.seekerPost?.userId;

  if (!postOwnerId) throw new Error("Post owner not found");

  let otherUserId: string;
  if (applicantId === currentUserId) otherUserId = postOwnerId;
  else if (postOwnerId === currentUserId) otherUserId = applicantId;
  else throw new Error("User not found in conversation");

  return { applicantId, postOwnerId, otherUserId };
}

// ✅ getUserConversations
export async function getUserConversations(userId: string) {
  const applications = await prisma.application.findMany({
    where: {
      OR: [
        { applicantId: userId },
        { providerPost: { userId: userId } },
        { seekerPost: { userId: userId } },
      ],
    },
    select: { id: true },
  });

  const applicationIds = applications.map((app: { id: string }) => app.id);
  if (applicationIds.length === 0) return [];

  const conversations = await prisma.conversation.findMany({
    where: { applicationId: { in: applicationIds } },
    include: {
      application: {
        include: {
          applicant: {
            select: {
              id: true,
              fullName: true,
              companyName: true,
              profilePicture: true,
            },
          },
          providerPost: {
            select: {
              title: true,
              userId: true,
              user: {
                select: {
                  id: true,
                  fullName: true,
                  companyName: true,
                  profilePicture: true,
                },
              },
            },
          },
          seekerPost: {
            select: {
              title: true,
              userId: true,
              user: {
                select: {
                  id: true,
                  fullName: true,
                  companyName: true,
                  profilePicture: true,
                },
              },
            },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          sender: {
            select: {
              id: true,
              fullName: true,
              companyName: true,
              profilePicture: true,
            },
          },
        },
      },
    },
  });

  // Fetch the current user's private key once (needed to decrypt previews)
  // 1. Fetch current user's private key
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { privateKey: true },
  });
  const myPrivKey = currentUser?.privateKey ?? null;

  // 2. Pre-fetch all "other" user private keys to avoid async calls inside .map()
  const otherUserIds = conversations.map(conv => {
    const applicantId = conv.application.applicantId;
    const postOwnerId = conv.application.providerPost?.userId || conv.application.seekerPost?.userId;
    return applicantId === userId ? postOwnerId : applicantId;
  }).filter((id): id is string => !!id);

  const otherUsers = await prisma.user.findMany({
    where: { id: { in: otherUserIds } },
    select: { id: true, privateKey: true }
  });
  const privKeyMap = new Map(otherUsers.map(u => [u.id, u.privateKey]));

  return conversations
    .map((conv: (typeof conversations)[number]) => {
      const { application } = conv;
      const applicant = application.applicant;
      const postUser = application.providerPost?.user || application.seekerPost?.user;
      const otherUser = application.applicantId === userId ? postUser : applicant;
      const otherUserId = otherUser?.id || "unknown";

      const unreadCount = conv.messages.filter(
        (msg: (typeof conv.messages)[number]) =>
          msg.senderId !== userId && !msg.readBy?.includes(userId)
      ).length;

      const lastMessage = conv.messages[0];

      // Decrypt last-message preview
      let decryptedContent: string | null = null;
      if (lastMessage) {
        const encKey = (lastMessage as any).encryptedKey as string | null;
        if (isEncrypted(lastMessage.content, encKey)) {
          try {
            // Determine which key to use
            const targetPrivKey = (lastMessage.senderId === userId) 
              ? (privKeyMap.get(otherUserId) ?? null) 
              : myPrivKey;

            if (targetPrivKey) {
              decryptedContent = decryptMessage(lastMessage.content, encKey!, targetPrivKey);
            } else {
              decryptedContent = "[encrypted]";
            }
          } catch {
            decryptedContent = "[encrypted]";
          }
        } else {
          decryptedContent = lastMessage.content; // legacy plain text
        }
      }

      return {
        conversationId: conv.id,
        unreadCount,
        lastMessage: lastMessage
          ? {
            id: lastMessage.id,
            content: decryptedContent,
            createdAt: lastMessage.createdAt,
            sender: lastMessage.sender,
            isRead: lastMessage.readBy?.includes(otherUserId),
          }
          : null,
        otherUser,
        postTitle:
          application.providerPost?.title ??
          application.seekerPost?.title ??
          "Unknown Post",
        updatedAt: conv.updatedAt,
      };
    })
    .filter((c) => c.otherUser !== null);
}

// ✅ getMessages
export async function getMessages(conversationId: string, userId: string) {
  const { otherUserId } = await resolveConversationParticipants(conversationId, userId);

  // Mark unread messages as read (atomic transaction)
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const unreadMessages = await tx.message.findMany({
      where: {
        conversationId,
        senderId: otherUserId,
        NOT: { readBy: { has: userId } },
      },
      select: { id: true },
    });

    for (const msg of unreadMessages) {
      await tx.message.update({
        where: { id: msg.id },
        data: { readBy: { push: userId } },
      });
    }
  });

  const messages = await prisma.message.findMany({
    where: { conversationId },
    include: {
      sender: {
        select: {
          id: true,
          fullName: true,
          companyName: true,
          profilePicture: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { privateKey: true },
  });
  const myPrivKey = currentUser?.privateKey ?? null;

  // Fetch the other user's private key to decrypt messages sent by the current user
  const otherUser = await prisma.user.findUnique({ where: { id: otherUserId }, select: { privateKey: true } });
  const otherPrivKey = otherUser?.privateKey ?? null;

  return messages.map((msg: (typeof messages)[number]) => {
    const encKey = (msg as any).encryptedKey as string | null;
    let decryptedContent = msg.content;

    if (isEncrypted(msg.content, encKey)) {
      try {
        // If I am the sender, use the recipient's key (since I encrypted it for them)
        // If I am the recipient, use my own key
        const targetPrivKey = (msg.senderId === userId) ? otherPrivKey : myPrivKey;
        
        if (targetPrivKey) {
          decryptedContent = decryptMessage(msg.content, encKey!, targetPrivKey);
        } else {
          decryptedContent = "[encrypted]";
        }
      } catch {
        decryptedContent = "[encrypted]";
      }
    }
    // else: legacy plain-text — returned as-is

    return {
      id: msg.id,
      conversationId: msg.conversationId,
      senderId: msg.senderId,
      content: decryptedContent, // ← plaintext delivered to client
      createdAt: msg.createdAt,
      sender: msg.sender,
      readBy: msg.readBy || [],
      isRead:
        msg.senderId === userId
          ? msg.readBy?.includes(otherUserId)
          : msg.readBy?.includes(userId),
    };
  });
}

// ✅ sendMessage — encrypts with recipient's RSA public key
export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string
) {
  // Resolve who the recipient is
  const { otherUserId } = await resolveConversationParticipants(
    conversationId,
    senderId
  );

  // Ensure recipient has an RSA key pair (lazy-generate if needed)
  const { publicKey: recipientPubKey } = await ensureUserKeys(otherUserId);

  // Also ensure sender has a key pair (for future received-message decryption)
  await ensureUserKeys(senderId);

  // Hybrid-encrypt the message
  const { encryptedContent, encryptedKey } = encryptMessage(content, recipientPubKey);

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId,
      content: encryptedContent, // ← AES-128-GCM ciphertext
      encryptedKey,                   // ← RSA-encrypted AES session key
      readBy: [],
    },
    include: {
      sender: { select: { id: true, fullName: true, companyName: true } },
    },
  });

  // Return with original plaintext so socket event is immediately usable by sender
  return {
    ...message,
    content, // ← plaintext for real-time socket emit
  };
}

// ✅ editMessage — re-encrypts new content with recipient's public key
export async function editMessage(
  messageId: string,
  senderId: string,
  newContent: string
) {
  const existingMessage = await prisma.message.findUnique({
    where: { id: messageId },
    select: { senderId: true, conversationId: true },
  });

  if (!existingMessage) throw new Error("Message not found");
  if (existingMessage.senderId !== senderId)
    throw new Error("You can only edit your own messages");

  // Resolve recipient
  const { otherUserId } = await resolveConversationParticipants(
    existingMessage.conversationId,
    senderId
  );

  const { publicKey: recipientPubKey } = await ensureUserKeys(otherUserId);
  const { encryptedContent, encryptedKey } = encryptMessage(newContent, recipientPubKey);

  const updatedMessage = await prisma.message.update({
    where: { id: messageId },
    data: { content: encryptedContent, encryptedKey },
    include: {
      sender: { select: { id: true, fullName: true, companyName: true } },
    },
  });

  return {
    ...updatedMessage,
    content: newContent, // ← plaintext for real-time delivery
  };
}
