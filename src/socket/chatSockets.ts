import { Server, Socket } from "socket.io";
import { sendMessage, editMessage } from "../services/user/chatService";

interface AuthedSocket extends Socket {
  user?: {
    id: string;
    role: string;
  };
}

interface SendMessagePayload {
  conversationId: string;
  content: string;
}

interface EditMessagePayload {
  messageId: string;
  newContent: string;
  conversationId: string;
}

export function setupSocket(io: Server) {
  io.on("connection", (socket: AuthedSocket) => {
    if (!socket.user) {
      console.log("Unauthenticated socket, disconnecting:", socket.id);
      socket.disconnect(true);
      return;
    }

    const userId = socket.user.id;
    console.log("User connected:", socket.id, "userId:", userId);

    socket.on("join_conversation", (conversationId: string) => {
      // Optional: verify in DB that userId is participant of conversationId
      socket.join(conversationId);
      console.log(`User ${userId} joined conversation: ${conversationId}`);
    });

    // Send Message
    socket.on("send_message", async (data: SendMessagePayload) => {
      try {
        const { conversationId, content } = data;

        if (!conversationId || !content) {
          return socket.emit("error_message", {
            message: "conversationId and content are required",
          });
        }

        const message = await sendMessage(conversationId, userId, content);
        io.to(conversationId).emit("receive_message", message);
      } catch (err) {
        console.error("send_message error:", err);
        socket.emit("error_message", { message: "Failed to send message" });
      }
    });

    // Edit Message
    socket.on("edit_message", async (data: EditMessagePayload) => {
      try {
        const { messageId, newContent, conversationId } = data;

        if (!messageId || !newContent || !conversationId) {
          return socket.emit("error_message", {
            message: "Missing required fields",
          });
        }

        const updatedMessage = await editMessage(
          messageId,
          userId, // authenticated user
          newContent
        );

        io.to(conversationId).emit("message_edited", updatedMessage);
        console.log(
          `Message edited in conversation ${conversationId} by ${userId}`
        );
      } catch (error) {
        console.error("edit_message error:", error);
        socket.emit("error_message", {
          message: "Failed to edit message",
        });
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id, "userId:", userId);
    });
  });
}
