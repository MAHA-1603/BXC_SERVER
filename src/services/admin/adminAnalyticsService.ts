import { prisma } from "../../config/database";

export const getPlatformOverview = async () => {
  const [
    totalUsers,
    totalProviders,
    totalSeekers,
    activeProviderPosts,
    activeSeekerPosts,
    totalApplications,
  ] = await Promise.all([
    prisma.user.count({ where: { status: "APPROVED" } }),
    prisma.user.count({ where: { mode: "PROVIDER", status: "APPROVED" } }),
    prisma.user.count({ where: { mode: "SEEKER", status: "APPROVED" } }),
    prisma.providerPost.count(),
    prisma.seekerPost.count(),
    prisma.application.count(),
  ]);

  return {
    users: { total: totalUsers, providers: totalProviders, seekers: totalSeekers },
    posts: { providerPosts: activeProviderPosts, seekerPosts: activeSeekerPosts },
    applications: totalApplications,
  };
};

export const getTrendingSkills = async () => {
  // Fetch active skills arrays
  const [providerPosts, seekerPosts] = await Promise.all([
    prisma.providerPost.findMany({
      select: { skillTags: true },
    }),
    prisma.seekerPost.findMany({
      select: { requiredSkills: true },
    }),
  ]);

  const skillFrequency: Record<string, number> = {};

  // Count Provider Skills
  providerPosts.forEach((post) => {
    post.skillTags.forEach((skill) => {
      const normalized = skill.toLowerCase().trim();
      skillFrequency[normalized] = (skillFrequency[normalized] || 0) + 1;
    });
  });

  // Count Seeker Skills
  seekerPosts.forEach((post) => {
    post.requiredSkills.forEach((skill) => {
      const normalized = skill.toLowerCase().trim();
      skillFrequency[normalized] = (skillFrequency[normalized] || 0) + 1;
    });
  });

  // Sort by highest frequency
  const sortedSkills = Object.entries(skillFrequency)
    .sort(([, countA], [, countB]) => countB - countA)
    .map(([skill, count]) => ({ skill, count }));

  // Return Top 20
  return sortedSkills.slice(0, 20);
};

export const getSectorTrends = async () => {
  // Aggregate Roles (Sectors)
  const [providerRoles, seekerRoles] = await Promise.all([
    prisma.providerPost.groupBy({
      by: ["role"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 20,
    }),
    prisma.seekerPost.groupBy({
      by: ["role"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 20,
    }),
  ]);

  return {
    topProviderRoles: providerRoles.map((r) => ({ role: r.role, count: r._count.id })),
    topSeekerRoles: seekerRoles.map((r) => ({ role: r.role, count: r._count.id })),
  };
};

export const getPlatformGrowth = async () => {
  // Note: MongoDB natively lacks easy GROUP BY DAY functions in Prisma.
  // We'll fetch the last 30 days and group in JavaScript memory to be fast and safe.

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [users, providerPosts, seekerPosts] = await Promise.all([
    prisma.user.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    }),
    prisma.providerPost.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    }),
    prisma.seekerPost.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    }),
  ]);

  const growthMapping: Record<string, { users: number; providerPosts: number; seekerPosts: number }> = {};

  // Initialize last 30 days
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    growthMapping[dateStr] = { users: 0, providerPosts: 0, seekerPosts: 0 };
  }

  // Populate metrics
  users.forEach((u) => {
    const dateStr = u.createdAt.toISOString().split("T")[0];
    if (growthMapping[dateStr]) growthMapping[dateStr].users++;
  });
  providerPosts.forEach((p) => {
    const dateStr = p.createdAt.toISOString().split("T")[0];
    if (growthMapping[dateStr]) growthMapping[dateStr].providerPosts++;
  });
  seekerPosts.forEach((s) => {
    const dateStr = s.createdAt.toISOString().split("T")[0];
    if (growthMapping[dateStr]) growthMapping[dateStr].seekerPosts++;
  });

  return Object.entries(growthMapping).map(([date, metrics]) => ({
    date,
    ...metrics,
  }));
};
