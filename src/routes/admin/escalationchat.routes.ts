import { Router } from "express";
import { postEscalationMessage, getEscalationConversationMessages } from "../../controllers/admin/escalationchat.controller";

import { authenticate, authorizeAdmin } from "../../middleware/auth";

const router = Router();

router.post("/:conversationId/message",authenticate, postEscalationMessage);
router.get("/:conversationId/messages",authenticate, getEscalationConversationMessages);

export default router;
