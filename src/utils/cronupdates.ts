import cron from "node-cron";
import { prisma } from "../config/database";
import { SubscriptionStatus } from "@prisma/client";
import { sendEmail } from "../utils/email";
import { createNotification } from "../services/notification/userNotificationService";

/**
 * Retry wrapper for production reliability
 */
const withRetry = async (fn: () => Promise<any>, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      console.error(`Cron attempt ${i + 1}/${maxRetries} failed:`, err.message);
      if (i === maxRetries - 1) throw err;
      await new Promise(res => setTimeout(res, 5000 * (i + 1))); // Backoff
    }
  }
};

/**
 * Expire active subscriptions that have ended and update user verification.
 * Also deducts remaining limits from user's combined limits.
 */
export const expireSubscriptions = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const runId = Date.now().toString();

  try {
    const expiredSubs = await prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        endDate: { lte: today },
      },
      include: {
        plan: true,
        user: { select: { id: true, email: true, fullName: true } }
      },
    });

    if (!expiredSubs.length) {
      console.log(`[${runId}] No subscriptions to expire`);
      return { expiredCount: 0 };
    }

    // Process each expired subscription - deduct limits and update status
    for (const sub of expiredSubs) {
      await prisma.$transaction(async (tx) => {
        // 1. Remove verification if plan had it
        if (sub.plan?.hasVerification) {
          await tx.user.update({
            where: { id: sub.userId },
            data: { isVerified: false },
          });
        }

        // 2. Reset User combined limits (Remove all previous limits)
        await tx.user.update({
          where: { id: sub.userId },
          data: {
            combinedJobsRemaining: 0,
            combinedUrgentJobsRemaining: 0,
            combinedBoostsRemaining: 0,
            combinedRefreshesRemaining: 0,
            combinedProfilesRemaining: 0,
            combinedTotalJobsUsed: 0,
            combinedTotalProfilesUsed: 0,
          }
        });

        // 3. Update subscription status to EXPIRED and clear remaining balances
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            status: SubscriptionStatus.EXPIRED,
            jobsRemaining: 0,
            profilesRemaining: 0,
            updatedAt: new Date(),
          },
        });

        // 3. Send expiry email
        if (sub.user?.email) {
          const subject = "Your BenchXchange subscription has expired";
          const text = `Hello ${sub.user.fullName},\n\nYour subscription has expired. Your access to premium features has been limited. Please subscribe to a new plan to restore full access.\n\n- BenchXchange Team`;
          const html = `<p>Hello ${sub.user.fullName},</p><p>Your subscription has <strong>expired</strong>. Your access to premium features has been limited. Please subscribe to a new plan to restore full access.</p><p>- BenchXchange Team</p>`;
          await sendEmail(sub.user.email, subject, text, html);
        }
      });
    }

    console.log(`[${runId}] Expired ${expiredSubs.length} subscriptions with limit deductions`);
    return { expiredCount: expiredSubs.length };
  } catch (err: any) {
    console.error(`[${runId}] CRITICAL: Subscription expiry failed`, err.message);
    throw err;
  }
};


/**
 * Expire Posts and Boosts based on duration
 */
const expirePostsAndBoosts = async () => {
  const today = new Date();
  const runId = Date.now().toString();

  try {
    // 1. Transition Expired Urgent Posts (Provider & Seeker)
    // We handle this first so they can be deactivated in the same run if they are already > 30 days old
    
    // Provider Urgent -> Bench
    const expiredUrgentProvider = await prisma.providerPost.findMany({
      where: {
        status: "ACTIVE",
        postCategory: "URGENT",
        expiryDate: { lte: today },
      },
      select: { id: true, createdAt: true }
    });

    for (const post of expiredUrgentProvider) {
      const newExpiry = new Date(post.createdAt);
      newExpiry.setDate(newExpiry.getDate() + 30);
      await prisma.providerPost.update({
        where: { id: post.id },
        data: { postCategory: "BENCH", expiryDate: newExpiry }
      });
    }

    // Seeker Urgent -> Bench
    const expiredUrgentSeeker = await prisma.seekerPost.findMany({
      where: {
        status: "ACTIVE",
        postCategory: "URGENT",
        expiryDate: { lte: today },
      },
      select: { id: true, createdAt: true }
    });

    for (const post of expiredUrgentSeeker) {
      const newExpiry = new Date(post.createdAt);
      newExpiry.setDate(newExpiry.getDate() + 30);
      await prisma.seekerPost.update({
        where: { id: post.id },
        data: { postCategory: "BENCH", expiryDate: newExpiry }
      });
    }

    // 2. Expire Posts (Status -> FILLED)
    const providerExpiry = await prisma.providerPost.updateMany({
      where: {
        status: "ACTIVE",
        expiryDate: { lte: today },
      },
      data: { status: "FILLED" },
    });

    const seekerExpiry = await prisma.seekerPost.updateMany({
      where: {
        status: "ACTIVE",
        expiryDate: { lte: today },
      },
      data: { status: "FILLED" },
    });

    // 2. Expire Boosts
    await prisma.providerPost.updateMany({
      where: {
        isBoosted: true,
        boostExpiry: { lte: today },
      },
      data: { isBoosted: false },
    });

    await prisma.seekerPost.updateMany({
      where: {
        isBoosted: true,
        boostExpiry: { lte: today },
      },
      data: { isBoosted: false },
    });

    console.log(`[${runId}] Expired ${providerExpiry.count} provider posts and ${seekerExpiry.count} seeker posts`);
  } catch (err: any) {
    console.error(`[${runId}] Post/Boost expiry failed:`, err.message);
  }
};

/**
 * Notify post owners about pending applications.
 */
/**
 * Notify post owners about pending applications.
 */
const notifyPendingApplications = async () => {
  const runId = Date.now().toString();
  let totalNotifications = 0;

  // ✅ Fix 1: Separate queries instead of dynamic model
  const providerPostsWithPendingApps = await prisma.providerPost.findMany({
    where: { Application: { some: { status: "PENDING" } } },
    include: {
      user: { select: { id: true, email: true, fullName: true } },
      Application: { where: { status: "PENDING" } },
    },
  });

  const seekerPostsWithPendingApps = await prisma.seekerPost.findMany({
    where: { Application: { some: { status: "PENDING" } } },
    include: {
      user: { select: { id: true, email: true, fullName: true } },
      Application: { where: { status: "PENDING" } },
    },
  });

  // Process provider posts
  for (const post of providerPostsWithPendingApps) {
    const user = post.user;
    if (!user?.email) continue;

    const appCount = post.Application.length;
    const subject = `You have ${appCount} pending application(s) on your provider post "${post.title}"`;
    const text = `Hello ${user.fullName || "User"},\n\nYou have ${appCount} pending application(s) for your provider post titled "${post.title}". Please review them.\n\nThank you.`;
    const html = `<p>Hello ${user.fullName || "User"},</p><p>You have <strong>${appCount}</strong> pending application(s) for your provider post titled "<strong>${post.title}</strong>". Please review them.</p><p>Thank you.</p>`;

    await sendEmail(user.email, subject, text, html);
    await createNotification(
      user.id,
      subject,
      `Pending applications for your provider post "${post.title}"`,
      "APPLICATION_REMINDER",
      {
        pageCode: "APPLICATION",
        preferredMode: "PROVIDER",
        postId: post.id,
        postType: "PROVIDER"
      }
    );
    totalNotifications++;
  }

  // Process seeker posts
  for (const post of seekerPostsWithPendingApps) {
    const user = post.user;
    if (!user?.email) continue;

    const appCount = post.Application.length;
    const subject = `You have ${appCount} pending application(s) on your seeker post "${post.title}"`;
    const text = `Hello ${user.fullName || "User"},\n\nYou have ${appCount} pending application(s) for your seeker post titled "${post.title}". Please review them.\n\nThank you.`;
    const html = `<p>Hello ${user.fullName || "User"},</p><p>You have <strong>${appCount}</strong> pending application(s) for your seeker post titled "<strong>${post.title}</strong>". Please review them.</p><p>Thank you.</p>`;

    await sendEmail(user.email, subject, text, html);
    await createNotification(
      user.id,
      subject,
      `Pending applications for your seeker post "${post.title}"`,
      "APPLICATION_REMINDER",
      {
        pageCode: "APPLICATION",
        preferredMode: "SEEKER",
        postId: post.id,
        postType: "SEEKER"
      }
    );
    totalNotifications++;
  }

  console.log(`[${runId}] Sent ${totalNotifications} pending application notifications`);
};


/**
 * Notify applicants about pending deal offers.
 */
const notifyPendingDealOffers = async () => {
  const runId = Date.now().toString();
  const pendingOffers = await prisma.application.findMany({
    where: { status: "PENDING_CONFIRMATION" },
    include: {
      applicant: { select: { id: true, fullName: true, email: true, companyName: true } },
      providerPost: { select: { title: true } },
      seekerPost: { select: { title: true } },
    },
  });

  let totalNotifications = 0;

  for (const app of pendingOffers) {
    const applicant = app.applicant;
    if (!applicant?.email) continue;

    const postTitle = app.providerPost?.title ?? app.seekerPost?.title ?? "your post";
    const subject = "Reminder: You have a pending deal offer";
    const text = `Hello ${applicant.companyName ?? applicant.fullName ?? "Applicant"},\n\nYou have a pending deal offer for "${postTitle}". Please review and respond.\n\nThank you.`;
    const html = `<p>Hello ${applicant.companyName ?? applicant.fullName ?? "Applicant"},</p><p>You have a pending deal offer for "<strong>${postTitle}</strong>". Please review and respond.</p><p>Thank you.</p>`;

    await sendEmail(applicant.email, subject, text, html);
    // Applicant's mode is opposite of post type
    const preferredMode = app.providerPost ? "SEEKER" : "PROVIDER";
    const postType = app.providerPost ? "PROVIDER" : "SEEKER";
    await createNotification(
      applicant.id,
      subject,
      `You have a pending deal offer for "${postTitle}". Please review and respond.`,
      "DEAL_OFFER_REMINDER",
      {
        pageCode: "APPLICATION",
        preferredMode,
        applicationId: app.id,
        postType
      }
    );
    totalNotifications++;
  }

  console.log(`[${runId}] Sent ${totalNotifications} pending deal notifications`);
};

/**
 * Reset monthly free posts for all active subscriptions on the 1st of every month.
 */
const resetMonthlyFreePosts = async () => {
  const runId = Date.now().toString();
  try {
    const result = await prisma.subscription.updateMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
      },
      data: {
        monthlyPostsUsed: 0,
        lastPostResetDate: new Date(),
      },
    });
    console.log(`[${runId}] Proactively reset monthly free posts for ${result.count} active subscriptions`);
  } catch (err: any) {
    console.error(`[${runId}] Monthly post reset failed:`, err.message);
  }
};


/**
 * Send subscription expiry reminders (7 days before)
 */
export const send7DaySubscriptionReminders = async () => {
  const reminderDate = new Date();
  reminderDate.setDate(reminderDate.getDate() + 7);
  reminderDate.setHours(0, 0, 0, 0);

  const nextDay = new Date(reminderDate);
  nextDay.setDate(nextDay.getDate() + 1);

  const expiringSubs = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      endDate: {
        gte: reminderDate,
        lt: nextDay,
      },
    },
    include: {
      user: { select: { email: true, fullName: true } },
      plan: true,
    },
  });

  for (const sub of expiringSubs) {
    if (sub.user?.email) {
      const subject = "Your BenchXchange subscription expires in 7 days";
      const text = `Hello ${sub.user.fullName},\n\nYour ${sub.plan?.title || "current"} subscription will expire on ${sub.endDate?.toDateString()}. Please renew it to continue enjoying our services.\n\n- BenchXchange Team`;
      const html = `<p>Hello ${sub.user.fullName},</p><p>Your <strong>${sub.plan?.title || "current"}</strong> subscription will expire on <strong>${sub.endDate?.toDateString()}</strong>. Please renew it to continue enjoying our services.</p><p>- BenchXchange Team</p>`;

      await sendEmail(sub.user.email, subject, text, html);
    }
  }
};

// 🔥 PRODUCTION CRON SCHEDULES
// Only run cron jobs on the first instance if running in a cluster (PM2)
const isMainInstance = !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === '0';

if (isMainInstance) {
  cron.schedule("0 0 * * *", async () => {
    await withRetry(expireSubscriptions);
  });

  // Subscription expiry reminder (Runs daily at 08:30 AM)
  // Reduced retries to 1 for notifications to avoid duplicates
  cron.schedule("30 8 * * *", async () => {
    await withRetry(send7DaySubscriptionReminders, 1);
  });

  // ✅ Proactive Monthly Reset (Runs at 00:00 on the 1st of every month)
  cron.schedule("0 0 1 * *", async () => {
    await withRetry(resetMonthlyFreePosts);
  });

  cron.schedule("0 2 * * *", async () => {
    await withRetry(expirePostsAndBoosts);
  });

  // Reduced retries to 1 for notifications to avoid duplicates
  cron.schedule("0 9 * * *", async () => {
    await withRetry(async () => {
      await notifyPendingApplications();
      await notifyPendingDealOffers();
    }, 1);
  });

  console.log("🚀 Cron jobs scheduled successfully on main instance");
} else {
  console.log("⏭️ Cron jobs skipped on secondary instance");
}
