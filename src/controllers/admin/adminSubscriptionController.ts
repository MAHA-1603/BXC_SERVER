import { Request, Response } from "express";
import { prisma } from "../../config/database";
import {
  SubscriptionStatus,
  UserStatus,
  PaymentType,
  PaymentCurrency,
  Country,
} from "@prisma/client";
import { logAudit } from "../../utils/auditHelper";
import { sendEmail } from "../../utils/email";
import * as adminService from "../../services/admin/adminService";

/**
 * GET /api/admin/user/:userId/subscription
 * Retrieves the current/latest subscription of a specific user.
 */
export const getUserSubscription = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Find the active subscription or the most recent subscription
    const activeSub = await prisma.subscription.findFirst({
      where: { userId, status: SubscriptionStatus.ACTIVE },
      include: { plan: true },
    });

    const latestSub = activeSub || await prisma.subscription.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: { plan: true },
    });

    return res.status(200).json({
      success: true,
      subscription: latestSub || null,
      userCombinedLimits: {
        combinedJobsRemaining: user.combinedJobsRemaining,
        combinedUrgentJobsRemaining: user.combinedUrgentJobsRemaining,
        combinedBoostsRemaining: user.combinedBoostsRemaining,
        combinedRefreshesRemaining: user.combinedRefreshesRemaining,
        combinedProfilesRemaining: user.combinedProfilesRemaining,
        combinedTotalJobsUsed: user.combinedTotalJobsUsed,
        combinedTotalProfilesUsed: user.combinedTotalProfilesUsed,
      },
    });
  } catch (error: any) {
    console.error("Error retrieving user subscription:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve user subscription",
    });
  }
};

/**
 * PUT /api/admin/user/:userId/subscription
 * Creates or updates user's subscription details, applying custom B2B pricing and free benefits.
 */
export const updateUserSubscription = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const {
      planId,
      startDate,
      endDate,
      nextBillingDate,
      status,
      customPrice,
      discountPercent,
      discountAmount,
      jobsRemaining,
      profilesRemaining,
      isUnlimitedJobs,
      isUnlimitedProfiles,
      trialExtensionDays,
      combinedJobsRemaining,
      combinedProfilesRemaining,
      combinedUrgentJobsRemaining,
      combinedBoostsRemaining,
      combinedRefreshesRemaining,
    } = req.body;

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // 1. Find or Initialize Subscription record
    let subscription = await prisma.subscription.findFirst({
      where: { userId, status: SubscriptionStatus.ACTIVE },
      include: { plan: true },
    });

    if (!subscription) {
      subscription = await prisma.subscription.findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        include: { plan: true },
      });
    }

    // If no subscription exists, we must create one if planId is provided
    let targetPlanId = planId || (subscription ? subscription.planId : null);
    if (!targetPlanId) {
      // Find the free plan as a fallback
      const freePlan = await prisma.plan.findFirst({
        where: { isFreePlan: true },
      });
      if (!freePlan) {
        return res.status(400).json({
          success: false,
          message: "No subscription exists for this user, and no planId was provided to create one.",
        });
      }
      targetPlanId = freePlan.id;
    }

    const targetPlan = await prisma.plan.findUnique({
      where: { id: targetPlanId },
    });

    if (!targetPlan) {
      return res.status(404).json({
        success: false,
        message: "Target plan not found",
      });
    }

    // Initialize values if creating a new subscription
    let currentSubscriptionId = subscription?.id;
    if (!subscription) {
      const now = new Date();
      const end = new Date(now);
      end.setDate(end.getDate() + (targetPlan.durationDays || 30));

      const newSub = await prisma.subscription.create({
        data: {
          userId,
          planId: targetPlanId,
          status: SubscriptionStatus.ACTIVE,
          startDate: now,
          endDate: end,
          nextBillingDate: end,
          jobsRemaining: targetPlan.jobsAllowed || 0,
          profilesRemaining: targetPlan.profilesAllowed || 0,
          isUnlimitedJobs: targetPlan.isUnlimitedJobs || false,
          isUnlimitedProfiles: targetPlan.isUnlimitedProfiles || false,
        },
        include: { plan: true },
      });
      subscription = newSub;
      currentSubscriptionId = newSub.id;
    }

    // Prepare update data for Subscription
    const subscriptionUpdates: any = {};

    // 2. Assign / Update Plan
    if (planId && planId !== subscription.planId) {
      subscriptionUpdates.planId = planId;
      // Default limits from the plan (unless explicitly overridden in the request)
      if (jobsRemaining === undefined) {
        subscriptionUpdates.jobsRemaining = targetPlan.jobsAllowed || 0;
      }
      if (profilesRemaining === undefined) {
        subscriptionUpdates.profilesRemaining = targetPlan.profilesAllowed || 0;
      }
      if (isUnlimitedJobs === undefined) {
        subscriptionUpdates.isUnlimitedJobs = targetPlan.isUnlimitedJobs || false;
      }
      if (isUnlimitedProfiles === undefined) {
        subscriptionUpdates.isUnlimitedProfiles = targetPlan.isUnlimitedProfiles || false;
      }
    }

    // 3. Update Billing Details
    if (startDate) {
      subscriptionUpdates.startDate = new Date(startDate);
    }
    if (endDate) {
      subscriptionUpdates.endDate = new Date(endDate);
    }
    if (nextBillingDate) {
      subscriptionUpdates.nextBillingDate = new Date(nextBillingDate);
    }

    // 4. Update Limits Overrides
    if (jobsRemaining !== undefined) {
      subscriptionUpdates.jobsRemaining = parseInt(jobsRemaining, 10);
    }
    if (profilesRemaining !== undefined) {
      subscriptionUpdates.profilesRemaining = parseInt(profilesRemaining, 10);
    }
    if (isUnlimitedJobs !== undefined) {
      subscriptionUpdates.isUnlimitedJobs = !!isUnlimitedJobs;
    }
    if (isUnlimitedProfiles !== undefined) {
      subscriptionUpdates.isUnlimitedProfiles = !!isUnlimitedProfiles;
    }

    // 5. Free Trial / Subscription Extensions
    if (trialExtensionDays !== undefined && trialExtensionDays !== null) {
      const currentEndDate = subscriptionUpdates.endDate || subscription.endDate || new Date();
      const currentNextBilling = subscriptionUpdates.nextBillingDate || subscription.nextBillingDate || new Date();

      const newEndDate = new Date(currentEndDate);
      newEndDate.setDate(newEndDate.getDate() + parseInt(trialExtensionDays, 10));

      const newNextBilling = new Date(currentNextBilling);
      newNextBilling.setDate(newNextBilling.getDate() + parseInt(trialExtensionDays, 10));

      subscriptionUpdates.endDate = newEndDate;
      subscriptionUpdates.nextBillingDate = newNextBilling;
      subscriptionUpdates.trialExtensionDays = parseInt(trialExtensionDays, 10);
    }

    // 6. Update Subscription Status
    let targetStatus: SubscriptionStatus | undefined;
    let shouldSuspendUser = false;

    if (status) {
      const normalizedStatus = status.trim().toUpperCase();
      if (normalizedStatus === "ACTIVE" || normalizedStatus === "ACTIVE") {
        targetStatus = SubscriptionStatus.ACTIVE;
      } else if (normalizedStatus === "INACTIVE" || normalizedStatus === "CANCELLED" || normalizedStatus === "INACTIVE") {
        targetStatus = SubscriptionStatus.CANCELLED;
        subscriptionUpdates.cancelledAt = new Date();
      } else if (normalizedStatus === "EXPIRED" || normalizedStatus === "EXPIRED") {
        targetStatus = SubscriptionStatus.EXPIRED;
      } else if (normalizedStatus === "SUSPENDED" || normalizedStatus === "SUSPENDED") {
        targetStatus = SubscriptionStatus.CANCELLED; // Map to Cancelled in DB
        shouldSuspendUser = true;
      } else {
        // Fallback or exact enum check
        if (Object.values(SubscriptionStatus).includes(normalizedStatus as SubscriptionStatus)) {
          targetStatus = normalizedStatus as SubscriptionStatus;
        }
      }
    }

    if (targetStatus) {
      subscriptionUpdates.status = targetStatus;
    }

    // 7. Custom Pricing (B2B Feature)
    let finalAmount = targetPlan.price || 0;
    let customPricingRecorded = false;

    if (customPrice !== undefined || discountPercent !== undefined || discountAmount !== undefined) {
      subscriptionUpdates.isCustomPricing = true;
      customPricingRecorded = true;

      if (customPrice !== undefined && customPrice !== null) {
        subscriptionUpdates.customPrice = parseFloat(customPrice);
        finalAmount = parseFloat(customPrice);
      } else if (discountPercent !== undefined && discountPercent !== null) {
        subscriptionUpdates.discountPercent = parseFloat(discountPercent);
        finalAmount = finalAmount * (1 - parseFloat(discountPercent) / 100);
      } else if (discountAmount !== undefined && discountAmount !== null) {
        subscriptionUpdates.discountAmount = parseFloat(discountAmount);
        finalAmount = Math.max(0, finalAmount - parseFloat(discountAmount));
      }
    }

    // Perform DB updates in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create a successful Payment history record if custom pricing details were submitted
      if (customPricingRecorded) {
        await tx.payment.create({
          data: {
            userId,
            subscriptionId: currentSubscriptionId,
            type: PaymentType.SUBSCRIPTION,
            amount: finalAmount,
            currency: targetPlan.countryCode === Country.INDIA ? PaymentCurrency.INR : PaymentCurrency.USD,
            status: "SUCCESS",
            razorpayPaymentId: "ADMIN_OVERRIDE_" + Date.now(),
            razorpaySignature: "admin_override",
          },
        });
      }

      // Update User suspension status if requested
      if (shouldSuspendUser) {
        await tx.user.update({
          where: { id: userId },
          data: {
            previousStatus: user.status,
            status: UserStatus.SUSPENDED,
            rejectionReason: "Suspended by Admin via Subscription Override",
          },
        });

        // Send suspension email notification
        try {
          await sendEmail(
            user.email,
            "Your BenchXchange Account is Suspended ⚠️",
            `Hi ${user.fullName},

Your account has been suspended by the administrator via subscription management override.

If you believe this is a mistake or have questions, please contact our support team.

- BenchXchange Team`
          );
        } catch (emailErr) {
          console.error("Failed to send suspension email:", emailErr);
        }
      }

      // If status is changed back to Active, restore the user if they were suspended
      if (targetStatus === SubscriptionStatus.ACTIVE && user.status === UserStatus.SUSPENDED) {
        const restoredStatus = user.previousStatus || UserStatus.APPROVED;
        await tx.user.update({
          where: { id: userId },
          data: {
            status: restoredStatus,
            previousStatus: null,
            rejectionReason: "",
          },
        });

        // Send unsuspension email notification
        try {
          await sendEmail(
            user.email,
            "Your BenchXchange Account Suspension Removed ✅",
            `Hi ${user.fullName},

Your account suspension has been lifted. You can now access your account and participate in BenchXchange.

- BenchXchange Team`
          );
        } catch (emailErr) {
          console.error("Failed to send unsuspension email:", emailErr);
        }
      }

      // Update User combined/addon limits if specified in the request
      const userUpdates: any = {};
      if (combinedJobsRemaining !== undefined) {
        userUpdates.combinedJobsRemaining = parseInt(combinedJobsRemaining, 10);
      }
      if (combinedProfilesRemaining !== undefined) {
        userUpdates.combinedProfilesRemaining = parseInt(combinedProfilesRemaining, 10);
      }
      if (combinedUrgentJobsRemaining !== undefined) {
        userUpdates.combinedUrgentJobsRemaining = parseInt(combinedUrgentJobsRemaining, 10);
      }
      if (combinedBoostsRemaining !== undefined) {
        userUpdates.combinedBoostsRemaining = parseInt(combinedBoostsRemaining, 10);
      }
      if (combinedRefreshesRemaining !== undefined) {
        userUpdates.combinedRefreshesRemaining = parseInt(combinedRefreshesRemaining, 10);
      }

      if (Object.keys(userUpdates).length > 0) {
        await tx.user.update({
          where: { id: userId },
          data: userUpdates,
        });
      }

      // Update the Subscription record
      const updatedSub = await tx.subscription.update({
        where: { id: currentSubscriptionId },
        data: subscriptionUpdates,
        include: { plan: true },
      });

      return { updatedSub, userUpdates };
    });

    logAudit(req, {
      action: "USER_SUBSCRIPTION_OVERRIDDEN",
      category: "PLAN",
      targetId: currentSubscriptionId,
      targetType: "Subscription",
      description: `Overrode subscription details for user ${user.fullName} (${user.email})`,
      metadata: {
        modifiedFields: Object.keys(req.body),
        customPricing: customPricingRecorded ? { finalAmount } : false,
        suspendedUser: shouldSuspendUser,
      },
    });

    // Fetch the updated user details to return the current state
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    return res.status(200).json({
      success: true,
      message: "User subscription updated successfully",
      subscription: result.updatedSub,
      userCombinedLimits: {
        combinedJobsRemaining: updatedUser?.combinedJobsRemaining,
        combinedUrgentJobsRemaining: updatedUser?.combinedUrgentJobsRemaining,
        combinedBoostsRemaining: updatedUser?.combinedBoostsRemaining,
        combinedRefreshesRemaining: updatedUser?.combinedRefreshesRemaining,
        combinedProfilesRemaining: updatedUser?.combinedProfilesRemaining,
        combinedTotalJobsUsed: updatedUser?.combinedTotalJobsUsed,
        combinedTotalProfilesUsed: updatedUser?.combinedTotalProfilesUsed,
      },
    });
  } catch (error: any) {
    console.error("Error updating user subscription:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update user subscription",
    });
  }
};
