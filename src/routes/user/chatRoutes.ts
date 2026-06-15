import express from "express";
import {
  getConversationsController,
  getMessagesController,
  sendMessageController,
  editMessageController,
} from "../../controllers/user/chatController";

import { authenticate } from "../../middleware/auth";
const router = express.Router();

router.get("/conversations", authenticate, getConversationsController);
router.get("/messages/:conversationId",authenticate, getMessagesController);
router.post("/message",authenticate, sendMessageController);
router.put("/edit-message", editMessageController);

export default router;
