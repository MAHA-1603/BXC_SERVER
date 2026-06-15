import { prisma } from "../../config/database";
import { SubscriptionStatus, PostCategory, Country } from "@prisma/client";
import { AppError } from "../../utils/errorHandler";


export const checkPostEligibility = async (userId: string, category: PostCategory, postType?: "provider" | "seeker") => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      Subscription: {
        where: { status: SubscriptionStatus.ACTIVE },
        include: { plan: true },
      },
    },
  });

  if (!user) throw new Error("User not found");

  // 🔒 SECURITY CHECK: Mandatory Documents for Verified Usage
  // Users can register without docs, but MUST upload them to start posting.
  if (!user.gstDocumentUrl) {
    throw new AppError("Business registration document (GST) is required to create posts. Please upload it in your profile to verify your account.", 403);
  }

  const activeSubscription = user.Subscription[0];

  // 1. MANDATORY: Active subscription check
  if (!activeSubscription) {
    throw new AppError("Active subscription required to participate in the ecosystem. Please subscribe to a plan to continue.", 402);
  }

  // 2. Monthly Reset Check
  const now = new Date();
  const lastReset = activeSubscription.lastPostResetDate || activeSubscription.startDate || new Date();
  const isNewMonth = now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear();

  let monthlyPostsUsed = activeSubscription.monthlyPostsUsed;
  if (isNewMonth) {
    monthlyPostsUsed = 0;
    await prisma.subscription.update({
      where: { id: activeSubscription.id },
      data: {
        monthlyPostsUsed: 0,
        lastPostResetDate: now,
      },
    });
  }

  // 3. Free Post Allowance (Layer 1: Monthly Bonus)
  // ✅ ENFORCEMENT: Only applies to BENCH posts. URGENT posts are NEVER free via monthly allowance.
  const freeLimit = activeSubscription.plan?.freePostsPerMonth ?? 0;

  if (category === PostCategory.BENCH && monthlyPostsUsed < freeLimit) {
    return {
      eligible: true,
      isFree: true,
      subscriptionId: activeSubscription.id,
      reason: "FREE_MONTHLY_QUOTA",
    };
  }

  // ✅ New Layer: Unlimited Plan Allotment
  // ✅ ENFORCEMENT: Only applies to BENCH posts. URGENT posts MUST be paid/addons even on unlimited plans.
  const isUnlimitedJobs = !!activeSubscription.isUnlimitedJobs || !!activeSubscription.plan?.isUnlimitedJobs;

  if (isUnlimitedJobs && category === PostCategory.BENCH) {
    return {
      eligible: true,
      subscriptionId: activeSubscription.id,
      reason: "UNLIMITED_PLAN",
    };
  }

  // Layer 2: Plan Allotment (Typically used for standard/BENCH posts included in plan)
  if (category === PostCategory.BENCH) {
    const hasTotalLimit = (activeSubscription.plan?.jobsAllowed || 0) > 0;
    const isTotalLimitReached = hasTotalLimit && activeSubscription.jobsRemaining <= 0;

    if (hasTotalLimit && !isTotalLimitReached) {
      return {
        eligible: true,
        subscriptionId: activeSubscription.id,
        reason: "PLAN_ALLOTMENT",
      };
    }
  }

  // 4. Addon Check (Layer 3)
  // Only available to active subscribers
  const addonLimitField = category === PostCategory.URGENT
    ? "combinedUrgentJobsRemaining"
    : "combinedJobsRemaining";

  if ((user[addonLimitField] || 0) > 0) {
    return {
      eligible: true,
      isFree: true,
      subscriptionId: activeSubscription.id,
      reason: "ADDON_LIMIT",
      isAddon: true,
    };
  }

  // 5. Paid post required (Addons purchase required)
  const country = activeSubscription.plan?.countryCode || (user.country?.toUpperCase() === "INDIA" || user.country?.toUpperCase() === "IND" || !user.country ? Country.INDIA : Country.INTERNATIONAL);

  const addonPrice = await prisma.addOn.findFirst({
    where: {
      category,
      countryCode: country
    },
  });

  const amount = addonPrice?.price ?? 0;
  const currency = country === Country.INDIA ? "INR" : "USD";

  return {
    eligible: false,
    needsPayment: true,
    amount,
    currency,
    reason: "SUBSCRIPTION_OR_PAY_PER_USE_REQUIRED",
  };
};

export const consumePostQuota = async (userId: string, category: PostCategory, subscriptionId?: string, reason?: string) => {
  console.log(`🔍 consumePostQuota: userId=${userId}, category=${category}, subId=${subscriptionId}, reason=${reason}`);

  // ✅ LAYER 1: Monthly Bonus — only increment monthlyPostsUsed, never touch jobsRemaining
  if (reason === "FREE_MONTHLY_QUOTA" && subscriptionId) {
    console.log("📅 [Layer 1] Using FREE MONTHLY QUOTA — incrementing monthlyPostsUsed only");
    return await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        monthlyPostsUsed: { increment: 1 },
      },
    });
  }

  // ✅ NEW LAYER: Unlimited Plan — only increment total/monthly used, skip decrementing jobsRemaining
  if (reason === "UNLIMITED_PLAN" && subscriptionId) {
    console.log("♾️ [Layer Unlimited] Using UNLIMITED PLAN — skipping decrement");
    return await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        monthlyPostsUsed: { increment: 1 },
        totalJobsUsed: { increment: 1 },
      },
    });
  }

  // ✅ LAYER 2: Plan Allotment — decrement jobsRemaining from plan
  if (reason === "PLAN_ALLOTMENT" && subscriptionId) {
    console.log("📦 [Layer 2] Using PLAN ALLOTMENT — decrementing jobsRemaining");
    return await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        monthlyPostsUsed: { increment: 1 },
        jobsRemaining: { decrement: 1 },
        totalJobsUsed: { increment: 1 },
      },
    });
  }

  // ✅ LAYER 3: Addon — decrement category-specific addon balance
  if (reason === "ADDON_LIMIT") {
    const addonLimitField = category === PostCategory.URGENT
      ? "combinedUrgentJobsRemaining"
      : "combinedJobsRemaining";

    console.log(`🎁 [Layer 3] Using ADDON — decrementing ${addonLimitField}`);
    return await prisma.user.update({
      where: { id: userId },
      data: {
        [addonLimitField]: { decrement: 1 },
        combinedTotalJobsUsed: { increment: 1 },
      },
    });
  }

  console.warn(`⚠️  consumePostQuota called with unrecognized reason: ${reason}`);
};
