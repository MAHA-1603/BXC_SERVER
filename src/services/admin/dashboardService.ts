import { prisma } from "../../config/database";
import { UserStatus, QueryStatus, ApplicationStatus, DealStage } from "@prisma/client";

// Helper to get date ranges
const getDateRanges = () => {
  const now = new Date();
  
  // Start of today
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  
  // Start of current month
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  // 30 days ago
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  
  // 12 months ago
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(now.getMonth() - 11);
  twelveMonthsAgo.setDate(1);

  return { now, startOfToday, startOfMonth, thirtyDaysAgo, twelveMonthsAgo };
};

export const getAdminDashboardStats = async () => {
  const { now, startOfToday, startOfMonth, thirtyDaysAgo, twelveMonthsAgo } = getDateRanges();

  // 1. Parallel fetch for basic counts to optimize performance
  const [
    totalUsers,
    activeUsers,
    pendingUsers,
    seekers,
    providers,
    newUsersThisMonth,
    totalOpenPosts,
    providerPostsTotal,
    providerPostsActive,
    providerPostsFilled,
    seekerPostsTotal,
    seekerPostsActive,
    seekerPostsFilled,
    totalApplications,
    totalDeals,
    activeNegotiations,
    closedSuccessfulDeals,
    closedFailedDeals,
    totalRevenue,
    totalEscalations,
    pendingEscalations
  ] = await Promise.all([
    // User Stats
    prisma.user.count(),
    prisma.user.count({ where: { status: "APPROVED" } }),
    prisma.user.count({ where: { status: "PENDING" } }),
    prisma.user.count({ where: { mode: "SEEKER" } }),
    prisma.user.count({ where: { mode: "PROVIDER" } }),
    prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
    
    // Post Stats (Total Open across both types)
    Promise.all([
      prisma.providerPost.count({ where: { status: "ACTIVE" } }),
      prisma.seekerPost.count({ where: { status: "ACTIVE" } })
    ]).then(([p, s]) => p + s),

    // Provider Post Specifics
    prisma.providerPost.count(),
    prisma.providerPost.count({ where: { status: "ACTIVE" } }),
    prisma.providerPost.count({ where: { status: "FILLED" } }),

    // Seeker Post Specifics
    prisma.seekerPost.count(),
    prisma.seekerPost.count({ where: { status: "ACTIVE" } }),
    prisma.seekerPost.count({ where: { status: "FILLED" } }),

    // Application Stats
    prisma.application.count(),
    
    // Deal Stats
    prisma.dealLifecycle.count(),
    prisma.dealLifecycle.count({ 
      where: { 
        stage: { 
          in: ["UNDER_DISCUSSION", "PENDING_CONFIRMATION", "OFFER_CONFIRMED", "INTRO_MADE", "STUCK_NEEDS_REVIEW"] 
        } 
      } 
    }),
    prisma.dealLifecycle.count({ where: { stage: "CLOSED_SUCCESSFUL" } }),
    prisma.dealLifecycle.count({ where: { stage: { in: ["CLOSED_NOT_PROCEEDING"] } } }),

    // Financials
    prisma.payment.aggregate({
      where: { status: "CAPTURED" },
      _sum: { amount: true }
    }),

    // Escalations (Operational)
    prisma.dealLifecycle.count({ where: { isEscalated: true } }),
    prisma.dealLifecycle.count({ 
      where: { 
        isEscalated: true, 
        adminAction: null // Assuming null action means pending resolution
      } 
    })
  ]);

  // 2. Complex Aggregations (Time Series)
  
  // Monthly User Growth (Last 12 months)
  // Note: Prisma doesn't strictly support date truncation in groupBy for Mongo perfectly in all versions, 
  // but we can simulate or fetch ranges. For MVP/Scale, raw aggregation or fetching createdAts is option.
  // Here we'll use a simplified approach: fetch count for each of last 12 months ranges if data volume is low, 
  // or use raw query if high. For now, let's fetch counts by iterating.
  const monthlyUserGrowth = await getMonthlyGenericData(twelveMonthsAgo, (start, end) => 
    prisma.user.count({ where: { createdAt: { gte: start, lt: end } } })
  );

  // Daily Application Count (Last 30 days)
  const dailyApplications = await getDailyGenericData(thirtyDaysAgo, (start, end) => 
    prisma.application.count({ where: { createdAt: { gte: start, lt: end } } })
  );

  // Daily Closed Deals (Last 30 days)
  const dailyClosedDeals = await getDailyGenericData(thirtyDaysAgo, (start, end) => 
    prisma.dealLifecycle.count({ 
      where: { 
        stage: { in: ["CLOSED_SUCCESSFUL", "CLOSED_NOT_PROCEEDING"] },
        updatedAt: { gte: start, lt: end } // Using updatedAt for close date approximation
      } 
    })
  );

  // Monthly Revenue (Last 12 months)
  const monthlyRevenue = await getMonthlyGenericData(twelveMonthsAgo, async (start, end) => {
    const result = await prisma.payment.aggregate({
      where: { 
        status: "CAPTURED",
        createdAt: { gte: start, lt: end }
      },
      _sum: { amount: true }
    });
    return result._sum.amount || 0;
  });

  // 3. Calculated Rates
  // Success Rate: Closed Successful / (Closed Successful + Closed Failed)
  const totalClosed = closedSuccessfulDeals + closedFailedDeals;
  const successRate = totalClosed > 0 
    ? ((closedSuccessfulDeals / totalClosed) * 100).toFixed(2) + "%" 
    : "0.00%";

  // Conversion Rate: Total Deals / Total Applications
  const conversionRate = totalApplications > 0 
    ? ((totalDeals / totalApplications) * 100).toFixed(2) + "%" 
    : "0.00%";

  // BenchXchange Success Score (0-10)
  // Simple algorithm: (Success Rate * 0.5) + (Active Ratio * 0.3) + (Escalation Health * 0.2)
  const successRateNum = parseFloat(successRate);
  const escalationRate = totalDeals > 0 ? (totalEscalations / totalDeals) : 0;
  const healthScore = Math.min(10, Math.max(0, (successRateNum / 10) - (escalationRate * 50) + 5)).toFixed(1);


  return {
    platform_pulse: {
      total_users: totalUsers,
      users_active_today: await prisma.user.count({ 
        where: { updatedAt: { gte: startOfToday } } // Approximate active today
      }), 
      server_status: "healthy"
    },
    
    user_stats: {
      total: totalUsers,
      active: activeUsers,
      pending: pendingUsers,
      breakdown: {
        seekers: seekers,
        providers: providers
      },
      growth: {
        new_this_month: newUsersThisMonth,
        monthly_breakdown: monthlyUserGrowth
      }
    },

    post_stats: {
      total_open: totalOpenPosts,
      provider_posts: {
        total: providerPostsTotal,
        open: providerPostsActive,
        filled: providerPostsFilled
      },
      seeker_posts: {
        total: seekerPostsTotal,
        open: seekerPostsActive,
        filled: seekerPostsFilled
      }
    },

    application_stats: {
      total_handled: totalApplications,
      daily_count: dailyApplications,
      conversion_rate: conversionRate
    },

    deal_stats: {
      total_lifecycle: totalDeals,
      status_breakdown: {
        active_negotiations: activeNegotiations,
        closed_successful: closedSuccessfulDeals,
        closed_failed: closedFailedDeals
      },
      daily_closed: dailyClosedDeals,
      global_success_rate: successRate
    },

    financials: {
      total_revenue_all_time: totalRevenue._sum.amount || 0,
      monthly_revenue: monthlyRevenue
    },

    operational_health: {
      escalations: {
        total: totalEscalations,
        pending: pendingEscalations
      },
      benchxchange_success_score: parseFloat(healthScore)
    }
  };
};

// ============= UTILS =============

// Helper to iterate days
async function getDailyGenericData<T>(startDate: Date, fetchFn: (start: Date, end: Date) => Promise<T>) {
  const data = [];
  const now = new Date();
  
  // Clone start date to avoid mutation
  let current = new Date(startDate);
  
  while (current <= now) {
    const nextDay = new Date(current);
    nextDay.setDate(current.getDate() + 1);
    
    const count = await fetchFn(current, nextDay);
    data.push({
      date: current.toISOString().split('T')[0],
      count: count
    });
    
    current = nextDay;
  }
  return data;
}

// Helper to iterate months
async function getMonthlyGenericData<T>(startDate: Date, fetchFn: (start: Date, end: Date) => Promise<T>) {
  const data = [];
  const now = new Date();
  
  let current = new Date(startDate);
  
  while (current <= now) {
    const nextMonth = new Date(current);
    nextMonth.setMonth(current.getMonth() + 1);
    
    const val = await fetchFn(current, nextMonth);
    const monthName = current.toLocaleString('default', { month: 'short', year: 'numeric' });
    
    data.push({
      month: monthName,
      value: val // 'count' or 'amount' can be mapped by caller, using 'value' generically
    });
    
    current = nextMonth;
  }
  return data;
}
