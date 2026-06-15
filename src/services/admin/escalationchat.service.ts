import { profile } from "console";
import { prisma } from "../../config/database";

// Send a new escalation message via REST API
export async function sendEscalationMessage(conversationId: string, userId: string, content: string) {
  const conversation = await prisma.escalationConversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) throw new Error("Conversation not found");
  if (userId !== conversation.escalatedById && userId !== conversation.adminId) {
    throw new Error("Not authorized");
  }
  return prisma.escalationMessage.create({
    data: {
      escalationConversationId: conversationId,
      senderId: userId,
      content,
      createdAt: new Date(),
    },
  });
}

export async function getEscalationMessages(conversationId: string, userId: string) {
  // Verify conversation and authorization
  const conversation = await prisma.escalationConversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) throw new Error("Conversation not found");
  if (userId !== conversation.escalatedById && userId !== conversation.adminId) {
    throw new Error("Not authorized");
  }

  // Fetch all messages for the conversation
  const messages = await prisma.escalationMessage.findMany({
    where: { escalationConversationId: conversationId },
    orderBy: { createdAt: "asc" },
  });

  // Extract unique sender IDs
  const senderIds = [...new Set(messages.map((msg) => msg.senderId))];

  // Batch fetch users whose IDs are in senderIds
  const users = await prisma.user.findMany({
    where: { id: { in: senderIds } },
    select: {
      id: true,
      fullName: true,
      email: true,
      profilePicture: true,
    },
  });

  // Batch fetch admins whose IDs are in senderIds
    const admins = await prisma.admin.findMany({
      where: { id: { in: senderIds } },
      select: {
        id: true,
        fullName: true,
        email: true,
        profilePicture: true,
      },
    });

  // Create a map of senderId to sender info for quick lookup
  const senderMap = new Map<string, any>();
  users.forEach((user) => senderMap.set(user.id, user));
  admins.forEach((admin) => senderMap.set(admin.id, admin));

  // Map messages to include sender info
  const messagesWithSender = messages.map((msg) => ({
    ...msg,
    sender: senderMap.get(msg.senderId) || null,
  }));

  return messagesWithSender;
}



