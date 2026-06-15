import { Request, Response } from "express";
import { prisma } from "../../config/database";
import { razorpay } from "../../config/razorpay";
import { PostCategory, PaymentType, Country, PaymentCurrency, SubscriptionStatus } from "@prisma/client";
import { checkPostEligibility } from "../../services/post/postUsageService";
import { verifyAddonPayment as verifyAddonPaymentService } from "../../subscriptions/addonOrderService";
import crypto from "crypto";
// No exchange rate import needed — international orders use USD natively

export const checkEligibility = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { category = PostCategory.BENCH } = req.query;
    const eligibility = await checkPostEligibility(userId, category as PostCategory);
    res.json({ success: true, ...eligibility });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const initiateAddonPayment = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { addonId } = req.body; 

    if (!addonId) {
      return res.status(400).json({ message: "addonId is required" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        Subscription: {
          where: { status: SubscriptionStatus.ACTIVE },
          include: { plan: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    // Look up the AddOn
    const addon = await prisma.addOn.findUnique({
      where: { id: addonId }
    });

    if (!addon) return res.status(404).json({ message: "Addon not found" });

    // ✅ Use addon.countryCode as the definitive source of truth for currency.
    // Deriving country from the user's subscription plan is unreliable — an
    // international user on a free (INDIA) plan would incorrectly resolve to INR.
    const addonIsIndia = addon.countryCode === Country.INDIA;
    const currency: PaymentCurrency = addonIsIndia ? PaymentCurrency.INR : PaymentCurrency.USD;

    const amount = addon.price || 0;

    // ✅ Use native Razorpay currency: INR for India (paise), USD for International (cents).
    // No backend conversion — Razorpay handles international USD payments directly.
    const razorpayCurrency = addonIsIndia ? "INR" : "USD";
    const razorpayAmount = Math.round(amount * 100); // paise (INR) or cents (USD)

    if (!addonIsIndia) {
      console.log(`[Addon Payment] International USD order: $${amount} = ${razorpayAmount} cents`);
    }

    const order = await razorpay.orders.create({
      amount: razorpayAmount,
      currency: razorpayCurrency, // ✅ INR for India, USD for International
      receipt: `receipt_${Date.now()}`,
    });

    // Create AddonPurchase record — store original price/currency for accounting
    await prisma.addOnPurchase.create({
      data: {
        userId,
        addonId: addon.id,
        orderId: order.id,
        amount: amount,   // source currency unit (₹ for India, $ for International)
        currency,         // ✅ derived from addon.countryCode
        status: "CREATED",
      },
    });

    res.json({ success: true, order });

  } catch (error: any) {
    console.error("Initiate addon payment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const verifyAddonPayment = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { 
      razorpay_order_id, razorpay_payment_id, razorpay_signature,
      razorpayOrderId, razorpayPaymentId, razorpaySignature 
    } = req.body;

    const result = await verifyAddonPaymentService({
      razorpayOrderId: razorpayOrderId || razorpay_order_id,
      razorpayPaymentId: razorpayPaymentId || razorpay_payment_id,
      razorpaySignature: razorpaySignature || razorpay_signature,
      userId,
    });

    res.json({
      success: true,
      message: result.message,
      paymentId: razorpay_payment_id || razorpayPaymentId,
      addon: (result.purchase as any).addon,
    });
  } catch (error: any) {
    console.error("Verify addon payment error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
