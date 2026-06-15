import { prisma } from "../config/database";
import { razorpay } from "../config/razorpay";
import crypto from "crypto";
import {
  PlanName,
  Country,
  SubscriptionStatus,
  PaymentType,
  PaymentCurrency,
  VerificationStatus
} from "@prisma/client";


// ✅ Helper to calculate discount for Founder Cohort
export const getSubscriptionPricing = async (userId: string, plan: any) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const previousPayments = await prisma.payment.count({
    where: { userId, type: PaymentType.SUBSCRIPTION, status: "SUCCESS" }
  });

  let finalAmount = plan.price || 0;
  const isFounderCohort =
    (!plan.founderCohortStartDate || user.createdAt >= plan.founderCohortStartDate) &&
    (!plan.founderCohortCutoff || user.createdAt <= plan.founderCohortCutoff);

  if (isFounderCohort && previousPayments === 0) {
    const discountPercent = plan.founderDiscount || 0;
    const discount = finalAmount * discountPercent;
    finalAmount -= discount;
  }

  return { finalAmount, isFounderCohort };
};

// ✅ Helper to cancel active subscriptions
export const cancelActiveSubscriptions = async (userId: string) => {
  await prisma.$transaction([
    prisma.subscription.updateMany({
      where: {
        userId,
        status: SubscriptionStatus.ACTIVE,
      },
      data: {
        status: SubscriptionStatus.EXPIRED,
        jobsRemaining: 0,
        profilesRemaining: 0,
        cancelledAt: new Date(),
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        combinedJobsRemaining: 0,
        combinedUrgentJobsRemaining: 0,
        combinedBoostsRemaining: 0,
        combinedRefreshesRemaining: 0,
        combinedProfilesRemaining: 0,
        combinedTotalJobsUsed: 0,
        combinedTotalProfilesUsed: 0,
      },
    }),
  ]);
};

// ✅ Activate free platform access (Required for all users)
// Note: This logic now centers on the monthly free post allowance
export const ensureUserHasSubscription = async (userId: string) => {
  console.log(`[ensureUserHasSubscription] Starting for user: ${userId}`);

  const activeSubscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: SubscriptionStatus.ACTIVE,
    },
    include: { plan: true },
  });

  if (activeSubscription) {
    console.log(`[ensureUserHasSubscription] Found existing ACTIVE subscription: ${activeSubscription.id}`);
    return activeSubscription;
  }

  // ✅ FIX #2: If user already had ANY subscription (EXPIRED or CANCELLED), do NOT auto-create a new one.
  // Expired users must explicitly purchase a new plan — not get a free trial again.
  const hasExpiredOrCancelledSub = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: [SubscriptionStatus.EXPIRED, SubscriptionStatus.CANCELLED] },
    },
  });

  if (hasExpiredOrCancelledSub) {
    console.log(`[ensureUserHasSubscription] User ${userId} already had a subscription (now ${hasExpiredOrCancelledSub.status}). Not creating a new free subscription.`);
    return null;
  }

  // 2. Find FREE plan in database (Required for all free access)
  const freePlan = await prisma.plan.findFirst({
    where: {
      isFreePlan: true,
    },
  });

  // If no FREE plan exists, return null and log an error (Admin must create the FREE plan)
  if (!freePlan) {
    console.error(`[ensureUserHasSubscription] Admin must create the FREE plan`);
    return null;
  }

  // 3. ENFORCEMENT LOGIC
  // Check if user has an ACTIVE subscription right now
  const activeSub = await prisma.subscription.findFirst({
    where: {
      userId,
      status: SubscriptionStatus.ACTIVE,
    },
  });

  if (activeSub) {
    console.log(`[ensureUserHasSubscription] User ${userId} already has an ACTIVE subscription.`);
    return activeSub;
  }

  // Check if user has already received the "Founder" benefit (90-day plan)
  const hasFounderSub = await prisma.subscription.findFirst({
    where: {
      userId,
      plan: {
        isFreePlan: true,
        founderExtensionDays: { gt: 0 } // They already got the bonus
      }
    }
  });

  if (hasFounderSub) {
    console.log(`[ensureUserHasSubscription] User ${userId} already received their Founder bonus.`);
    return null;
  }

  // 4. NEW: If user qualifies, create a FREE subscription
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { trialEndsAt: true, createdAt: true },
  });

  if (!user) {
    console.warn(`[ensureUserHasSubscription] User not found: ${userId}`);
    return null;
  }

  // Determine if user qualifies for free subscription
  const hasValidTrial = user.trialEndsAt && new Date() < user.trialEndsAt;

  // Qualifying as founder ONLY if at least one date is set and user matches
  const hasFounderConfig = freePlan.founderCohortStartDate || freePlan.founderCohortCutoff;
  const isFounderCohort = hasFounderConfig &&
    (!freePlan.founderCohortStartDate || user.createdAt >= freePlan.founderCohortStartDate) &&
    (!freePlan.founderCohortCutoff || user.createdAt <= freePlan.founderCohortCutoff);

  console.log(`[ensureUserHasSubscription] User ${userId} - hasValidTrial: ${hasValidTrial}, isFounderCohort: ${isFounderCohort}`);

  // ✅ FIX #3: Changed `|| freePlan` (always truthy — creates subs for anyone) to
  // `|| freePlan.trialPeriodDays > 0` so we only create a free sub if the plan actually grants trial days.
  if (hasValidTrial || isFounderCohort || (freePlan.trialPeriodDays ?? 0) > 0) {
    // Calculate subscription end date
    const startDate = new Date();
    let endDate: Date;

    if (hasValidTrial) {
      endDate = user.trialEndsAt!;
    } else if (freePlan.founderFreeEndDate && new Date() < freePlan.founderFreeEndDate) {
      // 1. Calculate the base duration from the plan (e.g. 3 months)
      const months = freePlan.duration || 0;
      const days = freePlan.durationDays || 0;
      const extensionDays = isFounderCohort ? (freePlan.founderExtensionDays || 0) : 0;

      endDate = new Date(startDate);
      if (days > 0) {
        endDate.setDate(endDate.getDate() + days + extensionDays);
      } else if (months > 0) {
        endDate.setMonth(endDate.getMonth() + months);
        endDate.setDate(endDate.getDate() + extensionDays);
      } else {
        // Fallback: If no duration is set, use trialPeriodDays or default to 14
        endDate.setDate(endDate.getDate() + (freePlan.trialPeriodDays || 0));
      }

      // 2. ✅ HARD DEADLINE: Cap at July 31st (founderFreeEndDate) if it exceeds it
      if (endDate > freePlan.founderFreeEndDate) {
        console.log(`[Founder Benefit] Capping subscription at July 31 deadline for user ${userId}`);
        endDate = freePlan.founderFreeEndDate;
      }
    } else {
      // 3. Regular users or those past the Founder deadline get the standard trialPeriodDays (e.g. 14 days)
      endDate = new Date(startDate);
      const trialDays = freePlan.trialPeriodDays || 0;
      endDate.setDate(endDate.getDate() + trialDays);
    }

    // Safety check: ensure endDate is not in the past
    if (endDate <= startDate) {
      console.warn(`[ensureUserHasSubscription] Calculated endDate ${endDate.toISOString()} is not in the future for user ${userId}. Skipping auto-creation.`);
      return null;
    }

    console.log(`[ensureUserHasSubscription] Creating subscription - planId: ${freePlan.id}, start: ${startDate.toISOString()}, end: ${endDate.toISOString()}`);

    // Create ACTIVE subscription
    const newSubscription = await prisma.subscription.create({
      data: {
        userId,
        planId: freePlan.id,
        status: SubscriptionStatus.ACTIVE,
        startDate,
        endDate,
        nextBillingDate: endDate,
        lastPostResetDate: startDate,
        jobsRemaining: freePlan.jobsAllowed || (isFounderCohort ? 10 : 5),
        profilesRemaining: freePlan.profilesAllowed || (isFounderCohort ? 10 : 5),
        isUnlimitedJobs: freePlan.isUnlimitedJobs || false,
        isUnlimitedProfiles: freePlan.isUnlimitedProfiles || false,
        monthlyPostsUsed: 0,
      },
      include: { plan: true },
    });

    console.log(`[ensureUserHasSubscription] Created subscription: ${newSubscription.id}, status: ${newSubscription.status}`);



    const subType = hasValidTrial ? "trial" : "founder cohort";
    console.log(`✅ Free ${subType} subscription created for user ${userId} (expires ${endDate.toISOString()})`);
    return newSubscription;
  }

  console.log(`[ensureUserHasSubscription] User does not qualify for free subscription`);
  return null;
};

// ✅ Create Subscription Order (Razorpay)
export const createSubscriptionService = async (
  userId: string,
  planId: string,
  country: Country,
  offerId?: string
) => {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error("Plan not found");
  if (plan.countryCode !== country) throw new Error("Plan not available for your country");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  // ✅ RULE 1: Block if user already has an ACTIVE subscription (REMOVED to allow upgrades)
  // Users are now allowed to generate a new Razorpay order/subscription link even while an existing plan is running.

  // ✅ RULE 2: Auto-cancel any stale PENDING subscriptions before creating a new one
  const cancelledCount = await prisma.subscription.updateMany({
    where: { userId, status: SubscriptionStatus.PENDING },
    data: { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date() },
  });
  if (cancelledCount.count > 0) {
    console.log(`[Subscription] Cancelled ${cancelledCount.count} stale PENDING subscription(s) for user ${userId}`);
  }

  // ─── INDIA: Razorpay Subscription (recurring, INR) ───────────────────────
  if (plan.razorpayPlanId) {
    try {
      const { finalAmount } = await getSubscriptionPricing(userId, plan);

      // ✅ FIRST PAID PAYMENT DISCOUNT FALLBACK
      // If the user gets a discount (Founder/Upgrade), we MUST use an Order.
      // Razorpay Subscriptions strictly follow the fixed plan price.
      if (finalAmount < (plan.price || 0)) {
        const orderAmount = Math.round(finalAmount * 100);

        if (!orderAmount || orderAmount <= 0) {
          throw new Error(`INVALID_AMOUNT: Calculated amount (${orderAmount}) is not valid for Razorpay.`);
        }

        console.log(`[Razorpay Request] Discount detected. Creating Order (INR). Amount: ${orderAmount} paise (₹${finalAmount})`);

        const order = await razorpay.orders.create({
          amount: orderAmount,
          currency: "INR",
          receipt: `receipt_${Date.now()}`,
          notes: { planId, userId },
        });

        return await prisma.subscription.create({
          data: {
            userId,
            planId,
            razorpaySubscriptionId: order.id,
            status: SubscriptionStatus.PENDING,
            monthlyPostsUsed: 0,
          },
        });
      }

      console.log(`[Razorpay Request] No discount. Creating Subscription (INR) for Plan: ${plan.razorpayPlanId}`);
      const razorpaySub = await razorpay.subscriptions.create({
        plan_id: plan.razorpayPlanId,
        customer_notify: 1,
        total_count: 1,
        offer_id: offerId || undefined,
      });

      return await prisma.subscription.create({
        data: {
          userId,
          planId,
          razorpaySubscriptionId: razorpaySub.id,
          status: SubscriptionStatus.PENDING,
          monthlyPostsUsed: 0,
        },
      });
    } catch (error: any) {
      console.error("Razorpay subscription error:", error);
      throw error;
    }
  }

  // ─── INTERNATIONAL: Razorpay Order (USD — native, no backend conversion) ─
  // Razorpay supports international payments in USD directly.
  // Amount is in cents (USD × 100). No INR conversion needed.
  try {
    const { finalAmount } = await getSubscriptionPricing(userId, plan);

    // ✅ USD order: amount in cents, currency = "USD"
    const orderAmount = Math.round(finalAmount * 100); // cents

    if (!orderAmount || orderAmount <= 0) {
      throw new Error(`INVALID_AMOUNT: Calculated amount (${orderAmount}) is not valid for Razorpay.`);
    }

    console.log(`[Razorpay Request] Creating International Order (USD). Amount: $${finalAmount} = ${orderAmount} cents`);
    const order = await razorpay.orders.create({
      amount: orderAmount, // cents
      currency: "USD",    // ✅ Native USD — Razorpay international payments
      receipt: `receipt_${Date.now()}`,
      notes: { planId, userId },
    });

    return await prisma.subscription.create({
      data: {
        userId,
        planId,
        razorpaySubscriptionId: order.id, // store order ID here for verification
        status: SubscriptionStatus.PENDING,
        monthlyPostsUsed: 0,
      },
    });
  } catch (error: any) {
    console.error("Razorpay international order error:", error);
    throw error;
  }
};

// ✅ Verify Razorpay Payment (India)
export const verifyRazorpaySubscription = async (data: {
  razorpaySubscriptionId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  userId: string;
}) => {
  const { razorpaySubscriptionId, razorpayPaymentId, razorpaySignature, userId } = data;

  if (razorpaySignature === "webhook_verified" || (process.env.NODE_ENV !== "production" && razorpaySignature === "developer_test_bypass")) {
    console.log("⚠️ Webhook or Developer test bypass used for verification"); //testing change after production
  } else {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) throw new Error("Razorpay secret not configured");

    const generatedSignature = razorpaySubscriptionId.startsWith("order_")
      ? crypto
        .createHmac("sha256", keySecret)
        .update(`${razorpaySubscriptionId}|${razorpayPaymentId}`)
        .digest("hex")
      : crypto
        .createHmac("sha256", keySecret)
        .update(`${razorpayPaymentId}|${razorpaySubscriptionId}`)
        .digest("hex");

    if (generatedSignature !== razorpaySignature) {
      console.error(`[Signature Mismatch] Expected: ${generatedSignature}, Received: ${razorpaySignature}`);
      throw new Error("Invalid signature");
    }
  }

  const subscription = await prisma.subscription.findFirst({
    where: { razorpaySubscriptionId, userId },
    include: {
      plan: true,
      user: true,
    },
  });

  if (!subscription) throw new Error("Subscription not found");

  const result = await prisma.$transaction(async (tx) => {
    // ✅ SEAMLESS UPGRADE: If another subscription is ACTIVE, expire it to seamlessly transition to the new plan.
    const concurrentActive = await tx.subscription.findFirst({
      where: {
        userId,
        status: SubscriptionStatus.ACTIVE,
        NOT: { id: subscription.id },
      },
      include: { plan: true },
    });

    let carryOverJobs = 0;
    let carryOverProfiles = 0;

    if (concurrentActive) {
      console.log(`[Upgrade] Upgrading from ${concurrentActive.plan?.title} to ${subscription.plan?.title}. Expiring old subscription.`);

      // ✅ Selective Carry-over: Only from PAID to PAID
      if (!concurrentActive.plan?.isFreePlan) {
        carryOverJobs = concurrentActive.jobsRemaining || 0;
        carryOverProfiles = concurrentActive.profilesRemaining || 0;
        console.log(`[Upgrade] Carrying over ${carryOverJobs} jobs and ${carryOverProfiles} profiles from previous PAID plan.`);
      }

      // Expire the old subscription and clear its limits
      await tx.subscription.update({
        where: { id: concurrentActive.id },
        data: {
          status: SubscriptionStatus.EXPIRED,
          jobsRemaining: 0,
          profilesRemaining: 0,
          cancelledAt: new Date(),
        },
      });

      // Clear the user's combined limits (addons) ONLY if coming from a Free/Trial plan
      // (If it's Paid-to-Paid, we keep addons as they are)
      if (concurrentActive.plan?.isFreePlan) {
        await tx.user.update({
          where: { id: userId },
          data: {
            combinedJobsRemaining: 0,
            combinedUrgentJobsRemaining: 0,
            combinedBoostsRemaining: 0,
            combinedRefreshesRemaining: 0,
            combinedProfilesRemaining: 0,
            combinedTotalJobsUsed: 0,
            combinedTotalProfilesUsed: 0,
          },
        });
      }
    }

    if (!subscription.plan) {
      throw new Error("PLAN_NOT_FOUND: Subscription plan information is missing. Cannot verify.");
    }

    // ✅ Founder's Cohort Logic: Discounts on First Paid Subscription
    const { finalAmount, isFounderCohort } = await getSubscriptionPricing(userId, subscription.plan);

    // Record payment with applied discount
    await tx.payment.create({
      data: {
        userId,
        subscriptionId: subscription.id,
        type: PaymentType.SUBSCRIPTION,
        amount: Math.round(finalAmount), // Standard Unit: Rupees/USD (Razorpay uses Paise/Cents)
        currency: subscription.plan!.countryCode === Country.INDIA ? PaymentCurrency.INR : PaymentCurrency.USD,
        status: "SUCCESS",
        razorpayPaymentId,
        razorpaySignature,
      },
    });

    const startDate = new Date();
    const endDate = new Date(startDate);
    let durationDays = subscription.plan!.durationDays ?? (subscription.plan!.name === "ANNUAL" ? 365 : 180);

    // ✅ Founder's Cohort: Apply extra extension days if configured on the plan
    if (isFounderCohort && subscription.plan!.founderExtensionDays) {
      console.log(`[Founder Benefit] Adding ${subscription.plan!.founderExtensionDays} extra days to subscription.`);
      durationDays += subscription.plan!.founderExtensionDays;
    }

    endDate.setDate(endDate.getDate() + durationDays);

    return await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        startDate,
        endDate,
        nextBillingDate: endDate,
        lastPostResetDate: new Date(),
        // ✅ Apply New Plan Allotment + Carry-Over
        jobsRemaining: (subscription.plan!.jobsAllowed || 0) + carryOverJobs,
        profilesRemaining: (subscription.plan!.profilesAllowed || 0) + carryOverProfiles,
        isUnlimitedJobs: subscription.plan!.isUnlimitedJobs || false,
        isUnlimitedProfiles: subscription.plan!.isUnlimitedProfiles || false,
      },
    });
  });

  return result;
};

// ─── INTERNATIONAL: Verify Razorpay Order Payment (USD) ──────────────────────
export const verifyRazorpayOrder = async (data: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  userId: string;
}) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature, userId } = data;

  // Verify signature: HMAC(order_id|payment_id)
  if (razorpaySignature === "webhook_verified" || (process.env.NODE_ENV !== "production" && razorpaySignature === "developer_test_bypass")) {
    console.log("⚠️ Webhook or Developer test bypass used for order verification");
  } else {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) throw new Error("Razorpay secret not configured");

    const generatedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (generatedSignature !== razorpaySignature) {
      throw new Error("Invalid signature");
    }
  }

  // Find the subscription that was created with this order ID
  const subscription = await prisma.subscription.findFirst({
    where: { razorpaySubscriptionId: razorpayOrderId, userId },
    include: { plan: true, user: true },
  });

  if (!subscription) throw new Error("Subscription not found for this order");

  return await prisma.$transaction(async (tx) => {
    // ✅ SEAMLESS UPGRADE: If another subscription is ACTIVE, expire it to seamlessly transition to the new plan.
    const concurrentActive = await tx.subscription.findFirst({
      where: { userId, status: SubscriptionStatus.ACTIVE, NOT: { id: subscription.id } },
      include: { plan: true },
    });

    if (concurrentActive) {
      console.log(`[Upgrade] Upgrading from ${concurrentActive.plan?.title} to ${subscription.plan?.title}. Expiring old subscription.`);
      // Expire the old subscription
      // Expire the old subscription and clear its limits
      await tx.subscription.update({
        where: { id: concurrentActive.id },
        data: {
          status: SubscriptionStatus.EXPIRED,
          jobsRemaining: 0,
          profilesRemaining: 0,
          cancelledAt: new Date(),
        },
      });

      // Clear the user's combined limits (addons) to ensure a clean state for the new subscription
      await tx.user.update({
        where: { id: userId },
        data: {
          combinedJobsRemaining: 0,
          combinedUrgentJobsRemaining: 0,
          combinedBoostsRemaining: 0,
          combinedRefreshesRemaining: 0,
          combinedProfilesRemaining: 0,
          combinedTotalJobsUsed: 0,
          combinedTotalProfilesUsed: 0,
        },
      });
    }

    if (!subscription.plan) {
      throw new Error("PLAN_NOT_FOUND: Subscription plan information is missing. Cannot verify.");
    }

    // Record payment — store original USD amount (no conversion; Razorpay charges in USD)
    const { finalAmount, isFounderCohort } = await getSubscriptionPricing(userId, subscription.plan);

    await tx.payment.create({
      data: {
        userId,
        subscriptionId: subscription.id,
        type: PaymentType.SUBSCRIPTION,
        amount: Math.round(finalAmount),  // ✅ USD amount charged via Razorpay international
        currency: PaymentCurrency.USD,    // ✅ USD — Razorpay native international payment
        status: "SUCCESS",
        razorpayPaymentId,
        razorpayOrderId,
        razorpaySignature,
      },
    });

    const startDate = new Date();
    const endDate = new Date(startDate);
    let durationDays = subscription.plan!.durationDays ?? (subscription.plan!.name === "ANNUAL" ? 365 : 90);

    // ✅ Founder's Cohort: Apply extra extension days if configured on the plan
    if (isFounderCohort && subscription.plan!.founderExtensionDays) {
      console.log(`[Founder Benefit] Adding ${subscription.plan!.founderExtensionDays} extra days to international subscription.`);
      durationDays += subscription.plan!.founderExtensionDays;
    }

    endDate.setDate(endDate.getDate() + durationDays);



    return await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        startDate,
        endDate,
        nextBillingDate: endDate,
        lastPostResetDate: new Date(),
        jobsRemaining: subscription.plan!.jobsAllowed || 0,
        profilesRemaining: subscription.plan!.profilesAllowed || 0,
        isUnlimitedJobs: subscription.plan!.isUnlimitedJobs || false,
        isUnlimitedProfiles: subscription.plan!.isUnlimitedProfiles || false,
      },
    });
  });
};

export async function getUserPaymentHistory(userId: string) {
  const [payments, transactions] = await Promise.all([
    prisma.payment.findMany({
      where: { userId },
      include: { subscription: { include: { plan: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Combine and sort by createdAt
  const combined = [
    ...payments.map((p) => ({ ...p, category: "SUBSCRIPTION" })),
    ...transactions.map((t) => ({ ...t, category: "ADDON" })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return combined;
}

export async function getPlans(country?: Country, audience?: string, userId?: string) {
  let user: any = null;
  let previousPaymentsCount = 0;

  if (userId) {
    user = await prisma.user.findUnique({ where: { id: userId } });
    previousPaymentsCount = await prisma.payment.count({
      where: { userId, type: PaymentType.SUBSCRIPTION, status: "SUCCESS" }
    });
  }

  const enrichPlan = (plan: any) => {
    if (plan.isFreePlan || !plan.price) return plan;

    const isEligibleForFounderDiscount =
      user &&
      (!plan.founderCohortStartDate || user.createdAt >= plan.founderCohortStartDate) &&
      (!plan.founderCohortCutoff || user.createdAt <= plan.founderCohortCutoff) &&
      previousPaymentsCount === 0;
    const discountPercent = plan.founderDiscount || 0;
    const discountedPrice = plan.price - (plan.price * discountPercent);

    return {
      ...plan,
      isFounderEligible: !!isEligibleForFounderDiscount,
      founderDiscountedPrice: Math.round(discountedPrice),
      founderExtensionDays: plan.founderExtensionDays || 0,
    };
  };

  const whereClause: any = { AND: [] };

  if (country) {
    // Show plans for the specific country OR any Free Plan (global access)
    whereClause.AND.push({
      OR: [
        { countryCode: country },
        { isFreePlan: true }
      ]
    });
  }

  // If a specific country is passed, return only that country's plans
  if (country) {
    const plans = await prisma.plan.findMany({
      where: whereClause,
    });
    return plans.map(enrichPlan);
  }

  // No country filter → return both IN and INTERNATIONAL grouped
  const [indiaPlans, internationalPlans] = await Promise.all([
    prisma.plan.findMany({
      // Show INDIA plans + any Free Plan (to ensure at least one group has it)
      where: { ...whereClause, OR: [{ countryCode: Country.INDIA }, { isFreePlan: true }] }
    }),
    prisma.plan.findMany({
      // Show ONLY International plans (don't duplicate the Free Plan here)
      where: { ...whereClause, countryCode: Country.INTERNATIONAL }
    }),
  ]);

  return {
    IN: indiaPlans.map(enrichPlan),
    INTERNATIONAL: internationalPlans.map(enrichPlan),
  };
}

// ─── UPGRADE LOGIC ─────────────────────────────────────────────────────────

/**
 * Initiates an upgrade by verifying the new plan is more expensive than the current one.
 */
export const createUpgradeService = async (
  userId: string,
  planId: string,
  country: Country,
  offerId?: string
) => {
  // ✅ Validate planId format (MongoDB ObjectId)
  if (!/^[0-9a-fA-F]{24}$/.test(planId)) {
    throw new Error("INVALID_PLAN_ID: The provided planId is not a valid format.");
  }

  const activeSub = await prisma.subscription.findFirst({
    where: { userId, status: SubscriptionStatus.ACTIVE },
    include: { plan: true },
  });

  const newPlan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!newPlan) throw new Error("New plan not found");

  if (activeSub && activeSub.plan) {
    const currentPrice = activeSub.plan.price || 0;
    const nextPrice = newPlan.price || 0;

    if (nextPrice <= currentPrice) {
      throw new Error(`UPGRADE_DENIED: The selected plan (${newPlan.title}) is not an upgrade over your current plan (${activeSub.plan.title}).`);
    }
  }

  // Reuse the existing subscription creation logic to generate Razorpay orders
  return await createSubscriptionService(userId, planId, country, offerId);
};

/**
 * Verifies an upgrade payment and CARRIES OVER unused limits.
 */
export const verifyRazorpayUpgradeSubscription = async (data: {
  razorpaySubscriptionId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  userId: string;
}) => {
  const { razorpaySubscriptionId, razorpayPaymentId, razorpaySignature, userId } = data;

  // Signature verification (reused logic)
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) throw new Error("Razorpay secret not configured");

  const generatedSignature = razorpaySubscriptionId.startsWith("order_")
    ? crypto.createHmac("sha256", keySecret).update(`${razorpaySubscriptionId}|${razorpayPaymentId}`).digest("hex")
    : crypto.createHmac("sha256", keySecret).update(`${razorpayPaymentId}|${razorpaySubscriptionId}`).digest("hex");

  if (generatedSignature !== razorpaySignature && razorpaySignature !== "developer_test_bypass" && razorpaySignature !== "webhook_verified") {
    throw new Error("Invalid signature");
  }

  const subscription = await prisma.subscription.findFirst({
    where: { razorpaySubscriptionId, userId },
    include: { plan: true, user: true },
  });

  if (!subscription) throw new Error("Subscription not found");

  return await prisma.$transaction(async (tx) => {
    let carriedJobs = 0;
    let carriedProfiles = 0;

    const concurrentActive = await tx.subscription.findFirst({
      where: { userId, status: SubscriptionStatus.ACTIVE, NOT: { id: subscription.id } },
    });

    if (concurrentActive) {
      console.log(`[Upgrade API] Carrying over ${concurrentActive.jobsRemaining} jobs from old plan.`);
      carriedJobs = concurrentActive.jobsRemaining || 0;
      carriedProfiles = concurrentActive.profilesRemaining || 0;

      // Expire old plan
      await tx.subscription.update({
        where: { id: concurrentActive.id },
        data: { status: SubscriptionStatus.EXPIRED, jobsRemaining: 0, profilesRemaining: 0, cancelledAt: new Date() },
      });

      // ✅ We do NOT reset user.combined limits here to preserve addons.
    }

    // Record Payment
    const { finalAmount } = await getSubscriptionPricing(userId, subscription.plan);
    await tx.payment.create({
      data: {
        userId,
        subscriptionId: subscription.id,
        type: PaymentType.SUBSCRIPTION,
        amount: Math.round(finalAmount),
        currency: subscription.plan!.countryCode === Country.INDIA ? PaymentCurrency.INR : PaymentCurrency.USD,
        status: "SUCCESS",
        razorpayPaymentId,
        razorpaySignature,
      },
    });

    const startDate = new Date();
    const endDate = new Date(startDate);
    const durationDays = subscription.plan!.durationDays || 180;
    endDate.setDate(endDate.getDate() + durationDays);

    return await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        startDate,
        endDate,
        jobsRemaining: (subscription.plan!.jobsAllowed || 0) + carriedJobs,
        profilesRemaining: (subscription.plan!.profilesAllowed || 0) + carriedProfiles,
        isUnlimitedJobs: subscription.plan!.isUnlimitedJobs || false,
        isUnlimitedProfiles: subscription.plan!.isUnlimitedProfiles || false,
      },
    });
  });
};

/**
 * International version of upgrade verification (USD Order)
 */
export const verifyRazorpayUpgradeOrder = async (data: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  userId: string;
}) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature, userId } = data;

  const subscription = await prisma.subscription.findFirst({
    where: { razorpaySubscriptionId: razorpayOrderId, userId },
    include: { plan: true, user: true },
  });

  if (!subscription) throw new Error("Subscription order not found");

  return await prisma.$transaction(async (tx) => {
    let carriedJobs = 0;
    let carriedProfiles = 0;

    const concurrentActive = await tx.subscription.findFirst({
      where: { userId, status: SubscriptionStatus.ACTIVE, NOT: { id: subscription.id } },
    });

    if (concurrentActive) {
      carriedJobs = concurrentActive.jobsRemaining || 0;
      carriedProfiles = concurrentActive.profilesRemaining || 0;

      await tx.subscription.update({
        where: { id: concurrentActive.id },
        data: { status: SubscriptionStatus.EXPIRED, jobsRemaining: 0, profilesRemaining: 0, cancelledAt: new Date() },
      });
    }

    const { finalAmount } = await getSubscriptionPricing(userId, subscription.plan);
    await tx.payment.create({
      data: {
        userId,
        subscriptionId: subscription.id,
        type: PaymentType.SUBSCRIPTION,
        amount: Math.round(finalAmount),
        currency: PaymentCurrency.USD,
        status: "SUCCESS",
        razorpayPaymentId,
        razorpayOrderId,
        razorpaySignature,
      },
    });

    const startDate = new Date();
    const endDate = new Date(startDate);
    const durationDays = subscription.plan!.durationDays || 365;
    endDate.setDate(endDate.getDate() + durationDays);

    return await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        startDate,
        endDate,
        jobsRemaining: (subscription.plan!.jobsAllowed || 0) + carriedJobs,
        profilesRemaining: (subscription.plan!.profilesAllowed || 0) + carriedProfiles,
        isUnlimitedJobs: subscription.plan!.isUnlimitedJobs || false,
        isUnlimitedProfiles: subscription.plan!.isUnlimitedProfiles || false,
      },
    });
  });
};
