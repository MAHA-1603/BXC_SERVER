import { Request, Response } from "express";
import {
  createAddonOrder,
  verifyAddonPayment,
  handleAddonPaymentFailure,
  getAddonPurchaseHistory,
} from "../subscriptions/addonOrderService"; // adjust import path
import { logAudit } from "../utils/auditHelper";

// Initiate an addon purchase
export const createAddonOrderController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = (req as any).user.id; // get userId from decoded token
    const { id } = req.params;
    const result = await createAddonOrder(userId, id);
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error("Addon Order creation error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

// Verify payment success callback/webhook
export const verifyAddonPaymentController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = (req as any).user.id; // get userId from decoded token
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    const result = await verifyAddonPayment({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      userId,
    });
    logAudit(req, {
      action: "ADDON_PURCHASE_VERIFIED",
      category: "ADDON",
      targetType: "AddOnPurchase",
      description: `User verified addon purchase for payment ${razorpayPaymentId}`,
      metadata: { razorpayOrderId, razorpayPaymentId },
    });
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Handle payment failure (manual or webhook)
export const handleAddonPaymentFailureController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = (req as any).user.id; // get userId from decoded token
    const { razorpayOrderId } = req.body;
    const result = await handleAddonPaymentFailure(razorpayOrderId, userId);
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const getAddonPurchaseHistoryController = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = (req as any).user.id; // get userId from decoded token
    const purchases = await getAddonPurchaseHistory(userId);
    res.json({ success: true, purchases });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
};
