import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export async function getProviderDashboard(userId: string) { 
  // Counts
  const totalPosts = await prisma.providerPost.count({ where: { userId } });
  const activePosts = await prisma.providerPost.count({ where: { userId, status: 'ACTIVE' } });
  const filledPosts = await prisma.providerPost.count({ where: { userId, status: 'FILLED' } });

  const appliedPostsCount = await prisma.application.count({ where: { applicantId: userId, seekerPostId: { not: null } } });
  const receivedPostsCount = await prisma.application.count({ where: { providerPost: { userId } } });

    const userInfo = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, fullName: true, email: true, role: true, companyName:true, createdAt: true }
  });
  // Recent activity code from previous example omitted for brevity

  // Monthly posts count for current year grouped by month (format YYYY-MM)
  const monthlyPosts = await prisma.providerPost.groupBy({
    by: ['createdAt'],
    where: {
      userId,
      createdAt: {
        gte: new Date(new Date().getFullYear(), 0, 1), // Jan 1 current year
        lt: new Date(new Date().getFullYear() + 1, 0, 1) // Jan 1 next year
      }
    },
    _count: { id: true }
  });

  // Convert raw dates to { month: 'YYYY-MM', count: number }
  const monthlyCounts = monthlyPosts.map(p => ({
    month: p.createdAt.toISOString().slice(0, 7), // e.g. 2025-09
    count: p._count.id
  }));

  // Yearly posts count grouped by year (all years provider posted)
  const yearlyPosts = await prisma.providerPost.groupBy({
    by: ['createdAt'],
    where: { userId },
    _count: { id: true }
  });

  // Aggregate counts by year string
  const yearlyCountsMap: Record<string, number> = {};

  yearlyPosts.forEach(p => {
    const year = p.createdAt.getUTCFullYear().toString();
    yearlyCountsMap[year] = (yearlyCountsMap[year] || 0) + p._count.id;
  });

  const yearlyCounts = Object.entries(yearlyCountsMap).map(([year, count]) => ({ year, count }));

  return {
    userInfo,
    totalPosts,
    activePosts,
    filledPosts,
    appliedPostsCount,
    receivedPostsCount,
    monthlyCounts,
    yearlyCounts,
    // Include recentActivity if needed
  };
}
