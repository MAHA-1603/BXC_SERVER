import { Server, Socket } from "socket.io";
import { prisma } from "../config/database";

interface AuthedSocket extends Socket {
  user?: {
    id: string;   // from JWT payload userId
    role: string; // "ADMIN" | "PROVIDER" | "SEEKER" ...
  };
}

interface JoinEscalationPayload {
  escalationConversationId: string;
}

interface SendEscalationMessagePayload {
  escalationConversationId: string;
  content: string;
}

export function setupEscalationChat(io: Server) {
  io.on("connection", (socket: AuthedSocket) => {
    if (!socket.user) {
      console.log("Unauthenticated escalation socket, disconnecting:", socket.id);
      socket.disconnect(true);
      return;
    }

    const userId = socket.user.id;
    const userRole = socket.user.role;
    console.log(
      `Escalation socket connected: ${socket.id}, userId: ${userId}, role: ${userRole}`
    );

    // JOIN ESCALATION CHAT
    socket.on(
      "joinEscalationChat",
      async ({ escalationConversationId }: JoinEscalationPayload) => {
        try {
          console.log("JOIN REQUEST:", { escalationConversationId, userId });

          const conversation = await prisma.escalationConversation.findUnique({
            where: { id: escalationConversationId },
          });

          if (!conversation) {
            return socket.emit("error", "Escalation conversation not found");
          }

          // Only escalator or assigned admin can join
          if (
            userId !== conversation.escalatedById &&
            userId !== conversation.adminId
          ) {
            return socket.emit("error", "Not authorized");
          }

          socket.join(escalationConversationId);

          socket.emit("joinedEscalationChat", { escalationConversationId });

          console.log(
            `User ${userId} joined escalation conversation ${escalationConversationId}`
          );
        } catch (err) {
          console.error("joinEscalationChat error:", err);
          socket.emit("error", "Failed to join escalation chat");
        }
      }
    );

    // SEND ESCALATION MESSAGE
    socket.on(
      "sendEscalationMessage",
      async ({ escalationConversationId, content }: SendEscalationMessagePayload) => {
        try {
          console.log("SEND MESSAGE:", {
            escalationConversationId,
            userId,
            content,
          });

          if (!content) {
            return socket.emit("error", "Content is required");
          }

          const conversation = await prisma.escalationConversation.findUnique({
            where: { id: escalationConversationId },
          });

          if (!conversation) {
            return socket.emit("error", "Escalation conversation not found");
          }

          if (
            userId !== conversation.escalatedById &&
            userId !== conversation.adminId
          ) {
            return socket.emit("error", "Not authorized to send messages");
          }

          const message = await prisma.escalationMessage.create({
            data: {
              escalationConversationId,
              senderId: userId,
              content,
              createdAt: new Date(),
            },
          });

          io.to(escalationConversationId).emit("newEscalationMessage", message);
        } catch (err) {
          console.error("sendEscalationMessage error:", err);
          socket.emit("error", "Failed to send escalation message");
        }
      }
    );

    // LEAVE CHAT ROOM
    socket.on(
      "leaveEscalationChat",
      ({ escalationConversationId }: { escalationConversationId: string }) => {
        socket.leave(escalationConversationId);
        console.log(
          `Socket ${socket.id} (userId: ${userId}) left room ${escalationConversationId}`
        );
      }
    );

    socket.on("disconnect", () => {
      console.log(
        `Escalation socket disconnected: ${socket.id}, userId: ${userId}`
      );
    });
  });
}
