import { prisma } from "../../config/database";
import { Prisma } from "@prisma/client";
import { transitionExpiredUrgentPosts } from "../../utils/postCleanup";

export interface SearchParams {
  q?: string;           // General search term
  skill?: string;       // Filter by skill
  title?: string;       // Filter by title
  role?: string;        // Filter by role
  experience?: number;  // Filter by minimum years of experience
  location?: string;    // Filter by location
  level?: string;       // Filter by level (Junior, Senior, etc.)
  isRemote?: boolean;   // Filter by remote work
  isBoosted?: boolean;  // Filter by boosted status
  isUrgent?: boolean;   // Filter by urgent category
  status?: string;      // Filter by post status (defaults to ACTIVE)
  page?: number;        // Page number (default: 1)
  limit?: number;       // Items per page (default: 10, max: 50)
}

interface PaginationResult {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

// Search Provider Posts
export const searchProviderPosts = async (viewerUserId: string, params: SearchParams) => {
  // Proactively transition expired urgent posts before search
  await transitionExpiredUrgentPosts();

  const {
    q,
    skill,
    title,
    role,
    experience,
    location,
    level,
    isRemote,
    isBoosted,
    isUrgent,
    status = "ACTIVE",
    page = 1,
    limit = 10,
  } = params;

  // Ensure limit is within bounds
  const safeLimit = Math.min(Math.max(1, limit), 50);
  const safePage = Math.max(1, page);
  const skip = (safePage - 1) * safeLimit;

  // Build where conditions
  const whereConditions: Prisma.ProviderPostWhereInput[] = [];

  // Status filter (always applied)
  whereConditions.push({ status: status as any });

  // General search (q parameter) - searches across multiple fields
  if (q) {
    const searchTerm = q.trim();
    whereConditions.push({
      OR: [
        { title: { contains: searchTerm, mode: "insensitive" } },
        { description: { contains: searchTerm, mode: "insensitive" } },
        { role: { contains: searchTerm, mode: "insensitive" } },
        { location: { contains: searchTerm, mode: "insensitive" } },
        { level: { contains: searchTerm, mode: "insensitive" } },
        { skillTags: { hasSome: [searchTerm, searchTerm.toLowerCase(), searchTerm.toUpperCase(), searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1).toLowerCase()] } },
      ],
    });
  }

  // Specific skill filter
  if (skill) {
    const s = skill.trim();
    whereConditions.push({
      OR: [
        { skillTags: { has: s } },
        { skillTags: { hasSome: [s.toLowerCase(), s.toUpperCase(), s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()] } },
      ],
    });
  }

  // Title filter
  if (title) {
    whereConditions.push({
      title: { contains: title, mode: "insensitive" },
    });
  }

  // Role filter
  if (role) {
    whereConditions.push({
      role: { contains: role, mode: "insensitive" },
    });
  }

  // Experience filter (minimum years)
  if (experience !== undefined) {
    whereConditions.push({
      experience: { gte: experience },
    });
  }

  // Location filter
  if (location) {
    whereConditions.push({
      location: { contains: location, mode: "insensitive" },
    });
  }

  // Level filter
  if (level) {
    whereConditions.push({
      level: { contains: level, mode: "insensitive" },
    });
  }

  // Remote work filter
  if (isRemote !== undefined) {
    whereConditions.push({ isRemote });
  }

  // Boosted filter
  if (isBoosted !== undefined) {
    whereConditions.push({ isBoosted });
  }

  // Urgent filter (Category)
  if (isUrgent !== undefined) {
    whereConditions.push({ postCategory: isUrgent ? "URGENT" : "BENCH" });
  }

  const where: Prisma.ProviderPostWhereInput = {
    AND: whereConditions,
  };

  // Get total count for pagination
  const totalCount = await prisma.providerPost.count({ where });

  // Fetch posts with all required includes (matching existing getAllPosts)
  const posts = await prisma.providerPost.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          companyName: true,
          profilePicture: true,
        },
      },
      Application: {
        select: {
          id: true,
          applicantId: true,
          status: true,
          conversationId: true,
          applicant: {
            select: {
              id: true,
              fullName: true,
              email: true,
              companyName: true,
              profilePicture: true,
            },
          },
          DealLifecycle: {
            select: {
              id: true,
              stage: true,
              lastUpdated: true,
              nextActionDue: true,
              isEscalated: true,
              issueCategory: true,
              moderatorNotes: true,
              adminAction: true,
            },
          },
        },
      },
    },
    orderBy: [
      { isBoosted: "desc" },    // 🥇 Top: Featured/Priority Boost
      { postCategory: "desc" }, // 🥈 High: Urgent Requirement
      { updatedAt: "desc" },    // Normal + 🔄 Refreshed (Bumped back to top)
    ],
    skip,
    take: safeLimit,
  });

  // Map posts to include owner and applicationCount (matching existing pattern)
  const mappedPosts = posts.map((post: any) => {
    const isOwner = viewerUserId === post.userId;
    return {
      ...post,
      owner: isOwner,
      applicationCount: post.Application.length,
    };
  });

  const pagination: PaginationResult = {
    page: safePage,
    limit: safeLimit,
    totalCount,
    totalPages: Math.ceil(totalCount / safeLimit),
  };

  return { posts: mappedPosts, pagination };
};

// Search Seeker Posts
export const searchSeekerPosts = async (viewerUserId: string, params: SearchParams) => {
  // Proactively transition expired urgent posts before search
  await transitionExpiredUrgentPosts();

  const {
    q,
    skill,
    title,
    role,
    experience,
    location,
    level,
    isRemote,
    isBoosted,
    isUrgent,
    status = "ACTIVE",
    page = 1,
    limit = 10,
  } = params;

  // Ensure limit is within bounds
  const safeLimit = Math.min(Math.max(1, limit), 50);
  const safePage = Math.max(1, page);
  const skip = (safePage - 1) * safeLimit;

  // Build where conditions
  const whereConditions: Prisma.SeekerPostWhereInput[] = [];

  // Status filter (always applied)
  whereConditions.push({ status: status as any });

  // General search (q parameter) - searches across multiple fields
  if (q) {
    const searchTerm = q.trim();
    whereConditions.push({
      OR: [
        { title: { contains: searchTerm, mode: "insensitive" } },
        { description: { contains: searchTerm, mode: "insensitive" } },
        { role: { contains: searchTerm, mode: "insensitive" } },
        { location: { contains: searchTerm, mode: "insensitive" } },
        { level: { contains: searchTerm, mode: "insensitive" } },
        { requiredSkills: { hasSome: [searchTerm, searchTerm.toLowerCase(), searchTerm.toUpperCase(), searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1).toLowerCase()] } },
        { preferredSkills: { hasSome: [searchTerm, searchTerm.toLowerCase(), searchTerm.toUpperCase(), searchTerm.charAt(0).toUpperCase() + searchTerm.slice(1).toLowerCase()] } },
      ],
    });
  }

  // Specific skill filter (searches both required and preferred skills)
  if (skill) {
    const s = skill.trim();
    whereConditions.push({
      OR: [
        { requiredSkills: { has: s } },
        { requiredSkills: { hasSome: [s.toLowerCase(), s.toUpperCase(), s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()] } },
        { preferredSkills: { has: s } },
        { preferredSkills: { hasSome: [s.toLowerCase(), s.toUpperCase(), s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()] } },
      ],
    });
  }

  // Title filter
  if (title) {
    whereConditions.push({
      title: { contains: title, mode: "insensitive" },
    });
  }

  // Role filter
  if (role) {
    whereConditions.push({
      role: { contains: role, mode: "insensitive" },
    });
  }

  // Location filter
  if (location) {
    whereConditions.push({
      location: { contains: location, mode: "insensitive" },
    });
  }

  // Level filter
  if (level) {
    whereConditions.push({
      level: { contains: level, mode: "insensitive" },
    });
  }

  // Remote work filter
  if (isRemote !== undefined) {
    whereConditions.push({ isRemote });
  }

  // Boosted filter
  if (isBoosted !== undefined) {
    whereConditions.push({ isBoosted });
  }

  // Urgent filter (Category)
  if (isUrgent !== undefined) {
    whereConditions.push({ postCategory: isUrgent ? "URGENT" : "BENCH" });
  }

  const where: Prisma.SeekerPostWhereInput = {
    AND: whereConditions,
  };

  // Get total count for pagination
  const totalCount = await prisma.seekerPost.count({ where });

  // Fetch posts with all required includes (matching existing getSeekerPosts)
  const posts = await prisma.seekerPost.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          companyName: true,
          profilePicture: true,
        },
      },
      Application: {
        select: {
          id: true,
          applicantId: true,
          status: true,
          conversationId: true,
          applicant: {
            select: {
              id: true,
              fullName: true,
              email: true,
              companyName: true,
              profilePicture: true,
            },
          },
          DealLifecycle: {
            select: {
              id: true,
              stage: true,
              lastUpdated: true,
              nextActionDue: true,
              isEscalated: true,
              issueCategory: true,
              moderatorNotes: true,
              adminAction: true,
            },
          },
        },
      },
    },
    orderBy: [
      { isBoosted: "desc" },    // 🥇 Top: Featured/Priority Boost
      { postCategory: "desc" }, // 🥈 High: Urgent Requirement
      { priority: "desc" },     // 🥉 Medium: Priority field (HIGH > MEDIUM > LOW alphabetically)
      { updatedAt: "desc" },    // Normal + 🔄 Refreshed (Bumped back to top)
    ],
    skip,
    take: safeLimit,
  });

  // Map posts to include owner and applicationCount (matching existing pattern)
  const mappedPosts = posts.map((post: any) => {
    const isOwner = viewerUserId === post.userId;
    return {
      ...post,
      owner: isOwner,
      applicationCount: post.Application.length,
    };
  });

  const pagination: PaginationResult = {
    page: safePage,
    limit: safeLimit,
    totalCount,
    totalPages: Math.ceil(totalCount / safeLimit),
  };

  return { posts: mappedPosts, pagination };
};
