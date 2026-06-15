import { Router } from "express";
import { handleRazorpayWebhook } from "../../controllers/payment/razorpayWebhookController";

const router = Router();

// Endpoint: /api/webhook/razorpay
router.post("/razorpay", handleRazorpayWebhook);

export default router;
