import { Request, Response } from "express";
import {
  sendEscalationMessage,
  getEscalationMessages,
} from "../../services/admin/escalationchat.service";
import { handleError } from "../../utils/errorHandler";

// POST /api/escalation/:conversationId/message
export async function postEscalationMessage(req: Request, res: Response) {
  const { conversationId } = req.params;
  const userId = (req as any).user.id;
  const { content } = req.body;
  try {
    const message = await sendEscalationMessage(
      conversationId,
      userId,
      content
    );
    res.status(201).json({ message });
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to send message");
    res.status(status).json(body);
  }
}

// GET /api/escalation/:conversationId/messages?userId=xyz
export async function getEscalationConversationMessages(
  req: Request,
  res: Response
) {
  const { conversationId } = req.params;
  const userId = (req as any).user.id;
  try {
    const messages = await getEscalationMessages(conversationId, userId);
    res.json({ messages });
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to fetch messages");
    res.status(status).json(body);
  }
}
