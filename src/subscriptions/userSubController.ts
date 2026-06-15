import { Request, Response } from 'express';
import * as subscriptionService from '../subscriptions/userSubServices';
import * as addonService from '../services/admin/addonService';
import { prisma } from '../config/database';

import { logAudit } from '../utils/auditHelper';
import { Country } from '@prisma/client';
import { mapCountryToEnum } from '../utils/countries';

export const activateFreePlanController = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    // Note: In the new model, we ensure the user has a subscription record
    const result = await subscriptionService.ensureUserHasSubscription(userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export async function getPlansAndAddOns(req: Request, res: Response) {
  try {
    const countryCode = req.query.country as string | undefined;
    const userId = (req as any).user?.id;

    let country: Country | undefined;
    
    if (countryCode) {
      country = mapCountryToEnum(countryCode);
    } else if (userId) {
      const user = await prisma.user.findUnique({ 
        where: { id: userId }, 
        select: { country: true } 
      });
      if (user?.country) {
        country = mapCountryToEnum(user.country);
      }
    }

    const [plansResponse, addOnsResponse] = await Promise.all([
      subscriptionService.getPlans(country, undefined, userId),
      addonService.getAddons(country),
    ]);

    let plans = plansResponse;
    let addOns = addOnsResponse;

    // If country is null, flatten the grouped response from subscriptionService.getPlans
    if (!country && plansResponse && typeof plansResponse === 'object' && !Array.isArray(plansResponse)) {
      const groupedPlans = plansResponse as { IN: any[], INTERNATIONAL: any[] };
      plans = [...(groupedPlans.IN || []), ...(groupedPlans.INTERNATIONAL || [])];
    }

    res.json({ success: true, plans, addOns });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function subscriptionController(req: Request, res: Response) {
  try {
    const userId = (req as any).user.id;
    let { planId, country, offerId } = req.body;

    if (!planId) return res.status(400).json({ message: 'planId is required' });

    // If country is not provided, fetch it from the plan automatically
    if (!country) {
      const plan = await prisma.plan.findUnique({ where: { id: planId } });
      if (!plan) return res.status(404).json({ message: 'Plan not found' });
      country = plan.countryCode;
    }

    const mappedCountry = mapCountryToEnum(country);
    const result = await subscriptionService.createSubscriptionService(userId, planId, mappedCountry, offerId);

    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error('Subscription error:', error);
    const isConflict = typeof error.message === 'string' && error.message.includes('ACTIVE_SUBSCRIPTION_EXISTS');
    res.status(isConflict ? 409 : 500).json({
      success: false,
      message: isConflict
        ? error.message.replace('ACTIVE_SUBSCRIPTION_EXISTS: ', '') // strip internal tag for clean frontend message
        : (error.message || 'Subscription creation failed'),
    });
  }
}

export async function verifyPaymentController(req: Request, res: Response) {
  try {
    const userId = (req as any).user.id;
    const {
      razorpay_subscription_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing razorpay_payment_id or razorpay_signature" });
    }

    let result;

    if (razorpay_subscription_id) {
      // ─── INDIA: Verify Razorpay Subscription ───────────────────────────────
      result = await subscriptionService.verifyRazorpaySubscription({
        razorpaySubscriptionId: razorpay_subscription_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        userId,
      });
    } else if (razorpay_order_id) {
      // ─── INTERNATIONAL: Verify Razorpay Order ──────────────────────────────
      result = await subscriptionService.verifyRazorpayOrder({
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        userId,
      });
    } else {
      return res.status(400).json({ message: "Provide either razorpay_subscription_id (India) or razorpay_order_id (International)" });
    }

    logAudit(req, {
      action: "SUBSCRIPTION_PURCHASE_VERIFIED",
      category: "PLAN",
      targetType: "Subscription",
      description: `User verified subscription payment via RAZORPAY`,
      metadata: { gateway: 'RAZORPAY' },
    });

    res.status(200).json({ success: true, data: result });

  } catch (error: any) {
    console.error("Payment verification error:", error);
    res.status(500).json({ success: false, message: error.message || "Payment verification failed" });
  }
}

export const paymentFailureController = async (req: Request, res: Response) => {
  try {
    res.json({ success: true, message: "Payment failure acknowledged" });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export async function userSubscriptionHistoryController(req: Request, res: Response) {
  try {
    const userId = (req as any).user.id;
    const subscriptionHistory = await subscriptionService.getUserPaymentHistory(userId);
    return res.status(200).json({ success: true, subscriptionHistory });
  } catch (error: any) {
    console.error('Error fetching subscription history:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

export async function upgradeSubscriptionController(req: Request, res: Response) {
  try {
    const userId = (req as any).user.id;
    let { planId, country, offerId } = req.body;

    if (!planId) return res.status(400).json({ message: 'planId is required for upgrade' });

    if (!country) {
      const plan = await prisma.plan.findUnique({ where: { id: planId } });
      if (!plan) return res.status(404).json({ message: 'Plan not found' });
      country = plan.countryCode;
    }

    const mappedCountry = mapCountryToEnum(country);
    const result = await subscriptionService.createUpgradeService(userId, planId, mappedCountry, offerId);

    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error('Upgrade initiation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Upgrade initiation failed',
    });
  }
}

export async function verifyUpgradePaymentController(req: Request, res: Response) {
  try {
    const userId = (req as any).user.id;
    const {
      razorpay_subscription_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Missing razorpay_payment_id or razorpay_signature" });
    }

    let result;

    if (razorpay_subscription_id) {
      result = await subscriptionService.verifyRazorpayUpgradeSubscription({
        razorpaySubscriptionId: razorpay_subscription_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        userId,
      });
    } else if (razorpay_order_id) {
      result = await subscriptionService.verifyRazorpayUpgradeOrder({
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        userId,
      });
    } else {
      return res.status(400).json({ message: "Provide either razorpay_subscription_id or razorpay_order_id" });
    }

    logAudit(req, {
      action: "SUBSCRIPTION_UPGRADE_VERIFIED",
      category: "PLAN",
      targetType: "Subscription",
      description: `User verified subscription UPGRADE via RAZORPAY`,
      metadata: { gateway: 'RAZORPAY' },
    });

    res.status(200).json({ success: true, data: result });

  } catch (error: any) {
    console.error("Upgrade payment verification error:", error);
    res.status(500).json({ success: false, message: error.message || "Upgrade verification failed" });
  }
}
