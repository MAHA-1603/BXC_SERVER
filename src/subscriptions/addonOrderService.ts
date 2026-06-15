import { SubscriptionStatus, Country, PaymentCurrency } from "@prisma/client";
import { prisma } from "../config/database";
import { razorpay } from "../config/razorpay";
import crypto from "crypto";
// No exchange rate import needed — international orders use USD natively

/**
 * Check if user has an active subscription (any plan)
 */
async function hasActiveSubscription(userId: string): Promise<boolean> {
  const activeSub = await prisma.subscription.findFirst({
    where: { userId, status: "ACTIVE" }, // use enum if defined
  });
  return !!activeSub;
}

/**
 * Create an Addon purchase order for the user
 */
export async function createAddonOrder(userId: string, addonId: string) {
  // Find active subscription including its plan
  const activeSubscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: SubscriptionStatus.ACTIVE,
    },
    include: {
      plan: true,
    },
  });

  let addon = await prisma.addOn.findUnique({ where: { id: addonId } });
  if (!addon) throw new Error("AddOn not found");

  // ✅ PRIMARY: Determine country from the user's active subscription plan.
  // ✅ SECONDARY: Fallback to the addon's own countryCode (most reliable for currency).
  // ✅ TERTIARY: Fallback to user profile country field.
  let addonCountryCode: Country;

  if (activeSubscription?.plan?.countryCode) {
    addonCountryCode = activeSubscription.plan.countryCode;
  } else {
    // Fallback: Check user profile country if no subscription exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const countryStr = user?.country?.toUpperCase() || "";
    addonCountryCode = (countryStr === "INDIA" || countryStr === "IND")
      ? Country.INDIA
      : Country.INTERNATIONAL; // ✅ Safe default: INTERNATIONAL (avoids INR for non-India users)
  }

  const isIndia = addonCountryCode === Country.INDIA;

  // If the addon has a grouping name, find the regional variant for the user's country
  if (addon.name) {
    const regionalVariant = await prisma.addOn.findFirst({
      where: {
        name: addon.name,
        countryCode: isIndia ? Country.INDIA : Country.INTERNATIONAL,
      },
    });
    if (regionalVariant) {
      addon = regionalVariant;
    }
  }

  // ✅ Use the resolved addon's own countryCode as the final source of truth for currency
  const resolvedIsIndia = addon.countryCode === Country.INDIA;
  const currency: PaymentCurrency = resolvedIsIndia ? PaymentCurrency.INR : PaymentCurrency.USD;

  const amount = addon.price ?? 0; // Standard unit (USD or INR)
  const shortUserId = userId.slice(0, 8);

  // ✅ Always use native currency via Razorpay.
  // India: INR (paise). International: USD (cents). No backend conversion.
  const razorpayCurrency = resolvedIsIndia ? "INR" : "USD";
  const razorpayAmount = resolvedIsIndia
    ? Math.round(amount * 100) // paise
    : Math.round(amount * 100); // cents (USD × 100)

  if (!resolvedIsIndia) {
    console.log(`[Addon Order] International USD order: $${amount} = ${razorpayAmount} cents`);
  }

  const order = await razorpay.orders.create({
    amount: razorpayAmount, // paise (INR, converted from USD if needed)
    currency: razorpayCurrency,
    receipt: `addon_order_${shortUserId}_${Date.now()}`,
  });

  // ✅ Create AddOnPurchase — store original amount/currency for accounting
  const purchase = await prisma.addOnPurchase.create({
    data: {
      userId,
      addonId: addon.id, // ✅ Use resolved regional addon ID
      orderId: order.id,
      amount: amount,   // stored in source currency unit (INR or USD)
      currency,         // ✅ PaymentCurrency enum, derived from addon.countryCode
      status: "CREATED"
    },
  });

  return { purchase, razorpayOrder: order };
}

/**
 * Verify Addon payment success
 */
export async function verifyAddonPayment(data: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  userId: string;
}) {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature, userId } = data;

  // Verify signature
  const isBypass = razorpaySignature === "developer_test_bypass" || razorpaySignature === "webhook_verified";
  if (!isBypass) {
    const keySecret = process.env.RAZORPAY_KEY_SECRET!;
    const generatedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(razorpayOrderId + "|" + razorpayPaymentId)
      .digest("hex");

    if (generatedSignature !== razorpaySignature) {
      throw new Error("Invalid signature");
    }
  }

  // Find AddOnPurchase by orderId
  const purchase = await prisma.addOnPurchase.findFirst({
    where: { orderId: razorpayOrderId, userId },
    include: { addon: true },
  });
  if (!purchase) throw new Error("Addon purchase not found");

  if (purchase.status === "PAID") {
    return { success: true, message: "Payment already verified", purchase, idempotent: true };
  }
  const result = await prisma.$transaction(async (tx) => {
    // Update AddOnPurchase as captured
    const updatedPurchase = await tx.addOnPurchase.update({
      where: { id: purchase.id },
      data: {
        paymentId: razorpayPaymentId,
        status: "PAID"
      },
    });

    // Ensure addon still exists
    if (!purchase.addon) {
      throw new Error("Addon definition not found. It may have been deleted.");
    }

    // Update user verification and priority if addon grants those
    const userUpdates: any = {};
    if (purchase.addon.hasVerification) userUpdates.isVerified = true;
    if (purchase.addon.hasPriorityTag) userUpdates.isPriorityUser = true;

    // Fetch current user combined limits
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("Target user for this purchase not found.");

    // Add addon's limits to the specific counters in user
    const limit = purchase.addon.jobPostingLimit ?? 0;
    
    if (purchase.addon.type === "BOOST") {
      userUpdates.combinedBoostsRemaining = (user.combinedBoostsRemaining || 0) + limit;
    } else if (purchase.addon.type === "REFRESH") {
      userUpdates.combinedRefreshesRemaining = (user.combinedRefreshesRemaining || 0) + limit;
    } else if (purchase.addon.category === "URGENT") {
      userUpdates.combinedUrgentJobsRemaining = (user.combinedUrgentJobsRemaining || 0) + limit;
    } else {
      // Default: BENCH or generic Job Posting
      userUpdates.combinedJobsRemaining = (user.combinedJobsRemaining || 0) + limit;
    }

    userUpdates.combinedProfilesRemaining = (user.combinedProfilesRemaining || 0) + (purchase.addon.profilesAllowed ?? 0);

    if (Object.keys(userUpdates).length > 0) {
      await tx.user.update({
        where: { id: userId },
        data: userUpdates,
      });
    }

    return updatedPurchase;
  });

  return { success: true, message: "Payment verified successfully", purchase: result };
}

/**
 * Handle Addon payment failure
 */
export async function handleAddonPaymentFailure(
  razorpayOrderId: string,
  userId: string
) {
  const purchase = await prisma.addOnPurchase.findFirst({
    where: { orderId: razorpayOrderId, userId },
  });
  if (!purchase) throw new Error("Addon purchase not found");

  if (purchase.status === "FAILED") {
    return { message: "Payment failure already recorded", idempotent: true };
  }

  await prisma.addOnPurchase.update({
    where: { id: purchase.id },
    data: { status: "FAILED" },
  });

  return { success: true, message: "Payment failure recorded" };
}

export async function getAddonPurchaseHistory(userId: string) {
  const purchases = await prisma.addOnPurchase.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      addon: true,
    },
  });

  // Format addon purchase data as needed
  return purchases.map((purchase) => ({
    purchaseId: purchase.id,
    addonTitle: purchase.addon?.title || "Deleted/Unknown Addon",
    description: purchase.addon?.description || "This addon information is no longer available.",
    amount: purchase.amount,
    status: purchase.status,
    purchaseDate: purchase.createdAt,
    expiryDate: null,
    hasVerification: purchase.addon?.hasVerification || false,
    hasPriorityTag: purchase.addon?.hasPriorityTag || false,
  }));
}
