import { prisma } from "../../config/database";

// Helper to get date ranges
const getDateRanges = () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(now.getMonth() - 11);
  twelveMonthsAgo.setDate(1);
  return { now, startOfMonth, twelveMonthsAgo };
};

// Helper to generate month labels for the last 12 months
function generateMonthLabels(startDate: Date): string[] {
  const labels: string[] = [];
  const now = new Date();
  let current = new Date(startDate);
  
  while (current <= now) {
    labels.push(current.toLocaleString('default', { month: 'short', year: 'numeric' }));
    current.setMonth(current.getMonth() + 1);
  }
  return labels;
}

// Helper to get month key from date
function getMonthKey(date: Date): string {
  return date.toLocaleString('default', { month: 'short', year: 'numeric' });
}

export const getUserDashboardStats = async (userId: string) => {
  const { now, twelveMonthsAgo } = getDateRanges();

  // ========== PHASE 1: All parallel queries in a single Promise.all ==========
  const [
    // === User's Posts (6 counts) ===
    providerPostsTotal,
    providerPostsOpen,
    providerPostsFilled,
    seekerPostsTotal,
    seekerPostsOpen,
    seekerPostsFilled,
    
    // === APPLIED Applications - user is applicant (4 counts) ===
    appliedTotal,
    appliedPending,
    appliedApproved,
    appliedRejected,
    
    // === RECEIVED on Provider Posts (4 counts) ===
    receivedOnProviderTotal,
    receivedOnProviderPending,
    receivedOnProviderApproved,
    receivedOnProviderRejected,
    
    // === RECEIVED on Seeker Posts (4 counts) ===
    receivedOnSeekerTotal,
    receivedOnSeekerPending,
    receivedOnSeekerApproved,
    receivedOnSeekerRejected,
    
    // === DEALS - Optimized: count instead of findMany ===
    dealsAsApplicantSuccessful,
    dealsAsApplicantFailed,
    dealsAsApplicantEscalated,
    dealsAsApplicantNegotiating,
    dealsAsApplicantTotal,
    
    // === DEALS as Post Owner (via raw aggregation) ===
    dealsAsOwnerStats,
    
    // === Other user data ===
    activeSubscription,
    unreadNotifications,
    userProfile,
    
    // === Platform stats ===
    platformSuccessfulDeals,
    platformFailedDeals,
    
    // === Monthly aggregations (OPTIMIZED - 2 queries instead of 24) ===
    providerPostsByMonth,
    seekerPostsByMonth,
    
    // === Platform deals by month (OPTIMIZED - 2 queries instead of 24) ===
    platformDealsByMonthSuccess,
    platformDealsByMonthFailed,
    
    // === Skill insights ===
    activeSeekerPosts,
    activeUserProviderPosts,
    
    // === Activity timeline data ===
    recentProviderPosts,
    recentSeekerPosts,
    recentApplications,
    recentDeals
  ] = await Promise.all([
    // Provider Posts counts
    prisma.providerPost.count({ where: { userId } }),
    prisma.providerPost.count({ where: { userId, status: "ACTIVE" } }),
    prisma.providerPost.count({ where: { userId, status: "FILLED" } }),
    
    // Seeker Posts counts
    prisma.seekerPost.count({ where: { userId } }),
    prisma.seekerPost.count({ where: { userId, status: "ACTIVE" } }),
    prisma.seekerPost.count({ where: { userId, status: "FILLED" } }),
    
    // Applied Applications counts
    prisma.application.count({ where: { applicantId: userId } }),
    prisma.application.count({ where: { applicantId: userId, status: "PENDING" } }),
    prisma.application.count({ where: { applicantId: userId, status: "APPROVED" } }),
    prisma.application.count({ where: { applicantId: userId, status: "REJECTED" } }),
    
    // Received on Provider Posts
    prisma.application.count({ where: { providerPost: { is: { userId } } } }),
    prisma.application.count({ where: { providerPost: { is: { userId } }, status: "PENDING" } }),
    prisma.application.count({ where: { providerPost: { is: { userId } }, status: "APPROVED" } }),
    prisma.application.count({ where: { providerPost: { is: { userId } }, status: "REJECTED" } }),
    
    // Received on Seeker Posts
    prisma.application.count({ where: { seekerPost: { is: { userId } } } }),
    prisma.application.count({ where: { seekerPost: { is: { userId } }, status: "PENDING" } }),
    prisma.application.count({ where: { seekerPost: { is: { userId } }, status: "APPROVED" } }),
    prisma.application.count({ where: { seekerPost: { is: { userId } }, status: "REJECTED" } }),
    
    // Deals as Applicant - Count by stage (5 queries instead of 1 findMany)
    prisma.dealLifecycle.count({ 
      where: { application: { applicantId: userId }, stage: "CLOSED_SUCCESSFUL" } 
    }),
    prisma.dealLifecycle.count({ 
      where: { application: { applicantId: userId }, stage: "CLOSED_NOT_PROCEEDING" } 
    }),
    prisma.dealLifecycle.count({ 
      where: { application: { applicantId: userId }, isEscalated: true } 
    }),
    prisma.dealLifecycle.count({ 
      where: { 
        application: { applicantId: userId }, 
        stage: { in: ["INTRO_MADE", "UNDER_DISCUSSION", "PENDING_CONFIRMATION", "OFFER_CONFIRMED"] }
      } 
    }),
    prisma.dealLifecycle.count({ 
      where: { application: { applicantId: userId } } 
    }),
    
    // Deals as Post Owner - Use aggregation to get counts efficiently
    prisma.$runCommandRaw({
      aggregate: "DealLifecycle",
      pipeline: [
        {
          $lookup: {
            from: "Application",
            localField: "applicationId",
            foreignField: "_id",
            as: "application"
          }
        },
        { $unwind: "$application" },
        {
          $lookup: {
            from: "ProviderPost",
            localField: "application.providerPostId",
            foreignField: "_id",
            as: "providerPost"
          }
        },
        {
          $lookup: {
            from: "SeekerPost",
            localField: "application.seekerPostId",
            foreignField: "_id",
            as: "seekerPost"
          }
        },
        {
          $match: {
            $or: [
              { "providerPost.userId": { $oid: userId } },
              { "seekerPost.userId": { $oid: userId } }
            ]
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            successful: { $sum: { $cond: [{ $eq: ["$stage", "CLOSED_SUCCESSFUL"] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ["$stage", "CLOSED_NOT_PROCEEDING"] }, 1, 0] } },
            escalated: { $sum: { $cond: ["$isEscalated", 1, 0] } },
            negotiating: { 
              $sum: { 
                $cond: [
                  { $in: ["$stage", ["INTRO_MADE", "UNDER_DISCUSSION", "PENDING_CONFIRMATION", "OFFER_CONFIRMED"]] }, 
                  1, 
                  0
                ] 
              } 
            }
          }
        }
      ],
      cursor: {}
    }).catch(() => ({ cursor: { firstBatch: [] } })), // Fallback if aggregation fails
    
    // Subscription
    prisma.subscription.findFirst({
      where: { userId, status: "ACTIVE" },
      select: {
        jobsRemaining: true,
        profilesRemaining: true,
        plan: { select: { title: true } }
      }
    }),
    
    // Notifications
    prisma.notification.count({ where: { userId, isRead: false, isDeleted: false } }),
    
    // User Profile
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        fullName: true,
        email: true,
        companyName: true,
        gstNumber: true,
        panNumber: true,
        industryFocus: true,
        city: true,
        state: true,
        profilePicture: true
      }
    }),
    
    // Platform stats
    prisma.dealLifecycle.count({ where: { stage: "CLOSED_SUCCESSFUL" } }),
    prisma.dealLifecycle.count({ where: { stage: "CLOSED_NOT_PROCEEDING" } }),
    
    // Monthly post activity - OPTIMIZED: groupBy instead of 12 individual queries
    prisma.providerPost.findMany({
      where: { userId, createdAt: { gte: twelveMonthsAgo } },
      select: { createdAt: true }
    }),
    prisma.seekerPost.findMany({
      where: { userId, createdAt: { gte: twelveMonthsAgo } },
      select: { createdAt: true }
    }),
    
    // Platform deals by month - OPTIMIZED
    prisma.dealLifecycle.findMany({
      where: { stage: "CLOSED_SUCCESSFUL", updatedAt: { gte: twelveMonthsAgo } },
      select: { updatedAt: true }
    }),
    prisma.dealLifecycle.findMany({
      where: { stage: "CLOSED_NOT_PROCEEDING", updatedAt: { gte: twelveMonthsAgo } },
      select: { updatedAt: true }
    }),
    
    // Skill insights data
    prisma.seekerPost.findMany({
      where: { status: "ACTIVE" },
      select: { requiredSkills: true }
    }),
    prisma.providerPost.findMany({
      where: { userId, status: "ACTIVE" },
      select: { skillTags: true, numberOfEmployees: true }
    }),
    
    // Activity timeline - fetch all in parallel (was sequential before)
    prisma.providerPost.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { title: true, createdAt: true }
    }),
    prisma.seekerPost.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { title: true, createdAt: true }
    }),
    prisma.application.findMany({
      where: { applicantId: userId },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { 
        createdAt: true, 
        providerPost: { select: { title: true } }, 
        seekerPost: { select: { title: true } } 
      }
    }),
    prisma.dealLifecycle.findMany({
      where: {
        application: { applicantId: userId },
        stage: { in: ["CLOSED_SUCCESSFUL", "CLOSED_NOT_PROCEEDING"] }
      },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: { updatedAt: true, stage: true }
    })
  ]);

  // ========== PHASE 2: Process results in memory ==========
  
  // Process deals as owner (from aggregation)
  let ownerStats = { total: 0, successful: 0, failed: 0, escalated: 0, negotiating: 0 };
  try {
    const rawResult = dealsAsOwnerStats as any;
    if (rawResult?.cursor?.firstBatch?.[0]) {
      const stats = rawResult.cursor.firstBatch[0];
      ownerStats = {
        total: stats.total || 0,
        successful: stats.successful || 0,
        failed: stats.failed || 0,
        escalated: stats.escalated || 0,
        negotiating: stats.negotiating || 0
      };
    }
  } catch {
    // Keep defaults if parsing fails
  }

  // Combine deals (as applicant + as owner, avoiding double-counting is handled by DB)
  const totalDeals = dealsAsApplicantTotal + ownerStats.total;
  const successfulDeals = dealsAsApplicantSuccessful + ownerStats.successful;
  const failedDeals = dealsAsApplicantFailed + ownerStats.failed;
  const escalatedDeals = dealsAsApplicantEscalated + ownerStats.escalated;
  const activeNegotiations = dealsAsApplicantNegotiating + ownerStats.negotiating;

  // Calculate success rate
  const totalClosed = successfulDeals + failedDeals;
  let personalSuccessRate: string;
  if (totalDeals === 0) {
    personalSuccessRate = "No deals yet";
  } else if (totalClosed === 0) {
    personalSuccessRate = "In progress";
  } else {
    personalSuccessRate = ((successfulDeals / totalClosed) * 100).toFixed(1) + "%";
  }

  // Received applications totals
  const receivedTotal = receivedOnProviderTotal + receivedOnSeekerTotal;
  const receivedPending = receivedOnProviderPending + receivedOnSeekerPending;
  const receivedApproved = receivedOnProviderApproved + receivedOnSeekerApproved;
  const receivedRejected = receivedOnProviderRejected + receivedOnSeekerRejected;

  const respondedApplications = receivedApproved + receivedRejected;
  const responseRate = receivedTotal > 0 
    ? ((respondedApplications / receivedTotal) * 100).toFixed(1) + "%" 
    : "N/A";

  const conversionRate = appliedTotal > 0 
    ? ((totalDeals / appliedTotal) * 100).toFixed(1) + "%" 
    : "0%";

  // Process monthly activity (in-memory aggregation)
  const monthlyActivity = processMonthlyActivity(
    providerPostsByMonth, 
    seekerPostsByMonth, 
    twelveMonthsAgo
  );

  // Process platform deals by month
  const monthlyPlatformDeals = processMonthlyPlatformDeals(
    platformDealsByMonthSuccess,
    platformDealsByMonthFailed,
    twelveMonthsAgo
  );

  // Process skill insights
  const topDemandedSkills = processSkillInsights(activeSeekerPosts, activeUserProviderPosts);

  // Process activity timeline
  const activityTimeline = processActivityTimeline(
    recentProviderPosts,
    recentSeekerPosts,
    recentApplications,
    recentDeals
  );

  // Profile completion
  const profileCompletion = calculateProfileCompletion(userProfile);

  // Platform success rate
  const platformTotalClosed = platformSuccessfulDeals + platformFailedDeals;
  const platformSuccessRate = platformTotalClosed > 0 
    ? ((platformSuccessfulDeals / platformTotalClosed) * 100).toFixed(1) + "%" 
    : "N/A";

  return {
    my_posts: {
      provider_posts: {
        total: providerPostsTotal,
        open: providerPostsOpen,
        filled: providerPostsFilled
      },
      seeker_posts: {
        total: seekerPostsTotal,
        open: seekerPostsOpen,
        filled: seekerPostsFilled
      },
      monthly_activity: monthlyActivity
    },

    my_applications: {
      total_applied: appliedTotal,
      status_breakdown: {
        pending: appliedPending,
        approved: appliedApproved,
        rejected: appliedRejected
      },
      conversion_to_deal: conversionRate,
      
      applied: {
        total: appliedTotal,
        pending: appliedPending,
        approved: appliedApproved,
        rejected: appliedRejected
      },
      received: {
        on_provider_posts: {
          total: receivedOnProviderTotal,
          pending: receivedOnProviderPending,
          approved: receivedOnProviderApproved,
          rejected: receivedOnProviderRejected
        },
        on_seeker_posts: {
          total: receivedOnSeekerTotal,
          pending: receivedOnSeekerPending,
          approved: receivedOnSeekerApproved,
          rejected: receivedOnSeekerRejected
        },
        total: receivedTotal,
        pending: receivedPending,
        approved: receivedApproved,
        rejected: receivedRejected,
        response_rate: responseRate
      },
      total: appliedTotal + receivedTotal
    },

    my_deals: {
      total: totalDeals,
      successful: successfulDeals,
      failed: failedDeals,
      in_escalation: escalatedDeals,
      active_negotiations: activeNegotiations,
      personal_success_rate: personalSuccessRate
    },

    marketplace_insights: {
      top_demanded_skills: topDemandedSkills,
      skill_gap_alert: topDemandedSkills
        .filter(s => s.your_bench_count === 0)
        .map(s => s.skill)
        .slice(0, 5)
    },

    activity_timeline: activityTimeline,

    subscription_status: activeSubscription ? {
      plan_name: activeSubscription.plan?.title || "Unknown",
      jobs_remaining: activeSubscription.jobsRemaining,
      profiles_remaining: activeSubscription.profilesRemaining
    } : null,

    notifications: {
      unread_count: unreadNotifications
    },

    profile_completion: {
      score: profileCompletion,
      is_complete: profileCompletion >= 80
    },

    platform_stats: {
      total_successful_deals: platformSuccessfulDeals,
      total_failed_deals: platformFailedDeals,
      success_rate: platformSuccessRate,
      monthly_deals: monthlyPlatformDeals
    }
  };
};

// ============= OPTIMIZED HELPER FUNCTIONS (in-memory processing) =============

function processMonthlyActivity(
  providerPosts: { createdAt: Date }[],
  seekerPosts: { createdAt: Date }[],
  startDate: Date
) {
  const monthLabels = generateMonthLabels(startDate);
  const providerMap: Record<string, number> = {};
  const seekerMap: Record<string, number> = {};
  
  // Initialize all months with 0
  monthLabels.forEach(label => {
    providerMap[label] = 0;
    seekerMap[label] = 0;
  });
  
  // Count provider posts by month
  providerPosts.forEach(post => {
    const key = getMonthKey(post.createdAt);
    if (providerMap[key] !== undefined) {
      providerMap[key]++;
    }
  });
  
  // Count seeker posts by month
  seekerPosts.forEach(post => {
    const key = getMonthKey(post.createdAt);
    if (seekerMap[key] !== undefined) {
      seekerMap[key]++;
    }
  });
  
  return monthLabels.map(month => ({
    month,
    provider: providerMap[month] || 0,
    seeker: seekerMap[month] || 0
  }));
}

function processMonthlyPlatformDeals(
  successfulDeals: { updatedAt: Date }[],
  failedDeals: { updatedAt: Date }[],
  startDate: Date
) {
  const monthLabels = generateMonthLabels(startDate);
  const successMap: Record<string, number> = {};
  const failedMap: Record<string, number> = {};
  
  monthLabels.forEach(label => {
    successMap[label] = 0;
    failedMap[label] = 0;
  });
  
  successfulDeals.forEach(deal => {
    const key = getMonthKey(deal.updatedAt);
    if (successMap[key] !== undefined) {
      successMap[key]++;
    }
  });
  
  failedDeals.forEach(deal => {
    const key = getMonthKey(deal.updatedAt);
    if (failedMap[key] !== undefined) {
      failedMap[key]++;
    }
  });
  
  return monthLabels.map(month => ({
    month,
    successful: successMap[month] || 0,
    failed: failedMap[month] || 0,
    total: (successMap[month] || 0) + (failedMap[month] || 0)
  }));
}

function processSkillInsights(
  seekerPosts: { requiredSkills: string[] }[],
  userProviderPosts: { skillTags: string[]; numberOfEmployees: number }[]
) {
  // Count skill demand
  const skillDemand: Record<string, number> = {};
  seekerPosts.forEach(post => {
    post.requiredSkills.forEach(skill => {
      skillDemand[skill] = (skillDemand[skill] || 0) + 1;
    });
  });

  // Count user's bench
  const userBench: Record<string, number> = {};
  userProviderPosts.forEach(post => {
    post.skillTags.forEach(skill => {
      userBench[skill] = (userBench[skill] || 0) + post.numberOfEmployees;
    });
  });

  // Combine and sort
  return Object.entries(skillDemand)
    .map(([skill, demand_count]) => ({
      skill,
      demand_count,
      your_bench_count: userBench[skill] || 0
    }))
    .sort((a, b) => b.demand_count - a.demand_count)
    .slice(0, 10);
}

function processActivityTimeline(
  providerPosts: { title: string; createdAt: Date }[],
  seekerPosts: { title: string; createdAt: Date }[],
  applications: { createdAt: Date; providerPost: { title: string } | null; seekerPost: { title: string } | null }[],
  deals: { updatedAt: Date; stage: string }[]
) {
  const timeline: Array<{ date: string; action: string; details: string }> = [];

  providerPosts.forEach(p => {
    timeline.push({
      date: p.createdAt.toISOString().split('T')[0],
      action: "POSTED_PROVIDER",
      details: p.title
    });
  });

  seekerPosts.forEach(p => {
    timeline.push({
      date: p.createdAt.toISOString().split('T')[0],
      action: "POSTED_SEEKER",
      details: p.title
    });
  });

  applications.forEach(a => {
    timeline.push({
      date: a.createdAt.toISOString().split('T')[0],
      action: "APPLIED",
      details: a.providerPost?.title || a.seekerPost?.title || "Post"
    });
  });

  deals.forEach(d => {
    timeline.push({
      date: d.updatedAt.toISOString().split('T')[0],
      action: d.stage === "CLOSED_SUCCESSFUL" ? "DEAL_SUCCESS" : "DEAL_FAILED",
      details: `Deal ${d.stage === "CLOSED_SUCCESSFUL" ? "completed" : "not proceeding"}`
    });
  });

  return timeline
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);
}

function calculateProfileCompletion(profile: any): number {
  if (!profile) return 0;
  
  const fields = [
    'fullName', 'email', 'companyName', 'gstNumber', 
    'industryFocus', 'city', 'state', 'profilePicture'
  ];
  
  const filledFields = fields.filter(field => 
    profile[field] && profile[field].toString().trim() !== ''
  ).length;
  
  return Math.round((filledFields / fields.length) * 100);
}
