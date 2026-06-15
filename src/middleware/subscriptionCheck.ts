import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/database";
import { SubscriptionStatus } from "@prisma/client";

/**
 * Middleware to ensure the user has an active subscription.
 * Applied to routes that require "participation" in the ecosystem (browsing, searching, etc.)
 */
export const requireActiveSubscription = async (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).user;

  if (!user) {
    console.warn("[subscriptionCheck] No user found in request");
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  // Admins bypass subscription checks
  if (user.role === "ADMIN" || (req as any).user.adminRole) {
    console.log(`[subscriptionCheck] Admin user bypassed - user: ${user.id}`);
    return next();
  }

  console.log(`[subscriptionCheck] Checking subscription for user: ${user.id}`);

  const activeSubscription = await prisma.subscription.findFirst({
    where: {
      userId: user.id,
      status: SubscriptionStatus.ACTIVE,
    },
    include: { plan: true },
  });

  if (!activeSubscription) {
    console.warn(`[subscriptionCheck] No active subscription found for user: ${user.id}`);

    // ✅ FIX #1: Check if user already had a subscription that EXPIRED or was CANCELLED
    // If yes → block immediately. Do NOT create a new free subscription for them.
    const hasExpiredSub = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: { in: [SubscriptionStatus.EXPIRED, SubscriptionStatus.CANCELLED] },
      },
    });

    if (hasExpiredSub) {
      console.warn(`[subscriptionCheck] User ${user.id} has an EXPIRED/CANCELLED subscription — blocking access`);
      return res.status(402).json({
        success: false,
        message: "Your subscription has expired. Please renew your plan to continue.",
        subscriptionExpired: true,
        needsSubscription: true,
      });
    }

    // Only reach here for brand-new users with NO subscription history at all
    try {
      console.log(`[subscriptionCheck] New user — attempting to create free subscription for user: ${user.id}`);
      const { ensureUserHasSubscription } = await import("../subscriptions/userSubServices");
      const sub = await ensureUserHasSubscription(user.id);

      if (sub) {
        console.log(`[subscriptionCheck] ✅ Successfully created subscription in middleware - subId: ${sub.id}`);
        return next();
      }
    } catch (error: any) {
      console.error(`[subscriptionCheck] Error creating free subscription:`, error);
    }

    // Still no subscription after all attempts
    return res.status(402).json({
      success: false,
      message: "Active subscription required to participate in the BenchXchange ecosystem. Please subscribe to continue.",
      needsSubscription: true,
    });
  }

  console.log(`[subscriptionCheck] ✅ Active subscription found for user: ${user.id} - plan: ${activeSubscription.plan?.title}`);
  next();
};
