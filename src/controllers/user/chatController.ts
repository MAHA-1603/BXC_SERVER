import { Request, Response } from "express";
import {
  getUserConversations,
  getMessages,
  sendMessage,
  editMessage,
} from "../../services/user/chatService";
import { handleError } from "../../utils/errorHandler";

import io from "../../index";

export async function getConversationsController(req: Request, res: Response) {
  try {
    const userId = (req as any).user.id; // Assuming user ID is set in auth middleware
    const conversations = await getUserConversations(userId);
    res.json({ success: true, data: conversations });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to fetch conversations");
    res.status(status).json(body);
  }
}

export async function getMessagesController(req: Request, res: Response) {
  try {
    const { conversationId } = req.params;
    const userId = (req as any).user.id;
    const messages = await getMessages(conversationId, userId);
    res.status(200).json({ success: true, data: messages });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to fetch messages");
    res.status(status).json(body);
  }
}

export async function sendMessageController(req: Request, res: Response) {
  try {
    const senderId = (req as any).user.id;
    const { conversationId, content } = req.body;

    if (!conversationId || !senderId || !content)
      return res
        .status(400)
        .json({ success: false, message: "Missing fields" });

    const message = await sendMessage(conversationId, senderId, content);

    // Emit the message to all users in that conversation room
    io.to(conversationId).emit("receive_message", message);

    res.status(201).json({ success: true, data: message });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to send message");
    res.status(status).json(body);
  }
}

export const editMessageController = async (req: Request, res: Response) => {
  try {
    const { messageId, senderId, newContent } = req.body;

    if (!messageId || !senderId || !newContent) {
      return res.status(400).json({
        success: false,
        message: "messageId, senderId, and newContent are required.",
      });
    }

    const updatedMessage = await editMessage(messageId, senderId, newContent);

    return res.status(200).json({
      success: true,
      message: "Message updated successfully.",
      data: updatedMessage,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Something went wrong.");
    return res.status(status).json(body);
  }
};
