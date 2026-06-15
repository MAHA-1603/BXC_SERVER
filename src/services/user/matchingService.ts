import { prisma } from "../../config/database";
import { PostStatus } from "@prisma/client";

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface MatchedProviderPost {
  post: any;
  matchScore: number;   // 0–100
  matchDetails: {
    skillMatches: string[];
    skillScore: number;
    levelMatch: boolean;
    roleMatch: boolean;
    remoteMatch: boolean;
  };
}

export interface MatchedSeekerPost {
  post: any;
  matchScore: number;   // 0–100
  matchDetails: {
    skillMatches: string[];
    skillScore: number;
    levelMatch: boolean;
    roleMatch: boolean;
    remoteMatch: boolean;
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise a skill string for comparison (lowercase, trim).
 */
const normalise = (s: string) => s.toLowerCase().trim();

/**
 * Compute skill overlap.
 * Returns matched skills and a percentage score (0–100) based on how many
 * of the required/seeker skills are covered by the provider's skill tags.
 */
const skillOverlap = (
  sourceSkills: string[],   // e.g. seeker requiredSkills
  targetSkills: string[]    // e.g. provider skillTags
): { matches: string[]; score: number } => {
  if (!sourceSkills.length) return { matches: [], score: 0 };

  const normTarget = new Set(targetSkills.map(normalise));
  const matches = sourceSkills.filter((s) => normTarget.has(normalise(s)));

  const score = Math.round((matches.length / sourceSkills.length) * 100);
  return { matches, score };
};

/**
 * Build a composite match score (0–100) from individual signals.
 *  - Skills   : 60 points
 *  - Level    : 20 points
 *  - Role     : 15 points
 *  - Remote   :  5 points
 */
const computeMatchScore = (details: {
  skillScore: number;
  levelMatch: boolean;
  roleMatch: boolean;
  remoteMatch: boolean;
}): number => {
  const skill  = (details.skillScore / 100) * 60;
  const level  = details.levelMatch  ? 20 : 0;
  const role   = details.roleMatch   ? 15 : 0;
  const remote = details.remoteMatch ?  5 : 0;
  return Math.round(skill + level + role + remote);
};

// ─── Common DB includes ───────────────────────────────────────────────────────

const providerInclude = {
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
    },
  },
};

const seekerInclude = {
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
    },
  },
};

// ─── findMatchingProvidersForSeeker ───────────────────────────────────────────

/**
 * Given a SeekerPost ID, return ACTIVE ProviderPost records ranked by how
 * well they match the seeker's requirements.
 *
 * Minimum match score threshold: 10 (at least one skill or role must align).
 */
export const findMatchingProvidersForSeeker = async (
  seekerPostId: string,
  viewerUserId: string,
  page = 1,
  limit = 10
): Promise<{
  seekerPost: any;
  matches: MatchedProviderPost[];
  pagination: { page: number; limit: number; totalCount: number; totalPages: number };
}> => {
  // 1. Load the seeker post
  const seekerPost = await prisma.seekerPost.findUnique({
    where: { id: seekerPostId },
  });

  if (!seekerPost) {
    throw new Error("Seeker post not found");
  }

  // 2. Gather matching signals from the seeker post
  const seekerSkills  = [
    ...(seekerPost.requiredSkills  || []),
    ...(seekerPost.preferredSkills || []),
  ];
  const seekerRole    = normalise(seekerPost.role    || "");
  const seekerLevel   = normalise(seekerPost.level   || "");
  const seekerRemote  = seekerPost.isRemote;

  // 3. Build a DB-level pre-filter to narrow candidates:
  //    - Status ACTIVE
  //    - At least one overlapping skill tag OR same role (case-insensitive contains)
  const providerWhere: any = {
    status: PostStatus.ACTIVE,
    isRemovedByAdmin: false,
    OR: [
      ...(seekerSkills.length
        ? [{
            skillTags: {
              hasSome: seekerSkills,
            },
          }]
        : []),
      ...(seekerRole
        ? [{ role: { contains: seekerRole, mode: "insensitive" as const } }]
        : []),
    ],
  };

  // If OR is empty (no skills, no role) fall back to all active posts
  if (!providerWhere.OR.length) {
    delete providerWhere.OR;
  }

  // 4. Fetch candidates
  const candidates = await prisma.providerPost.findMany({
    where: providerWhere,
    include: providerInclude,
    orderBy: [
      { isBoosted: "desc" },
      { postCategory: "desc" },
      { updatedAt: "desc" },
    ],
  });

  // 5. Score every candidate in-memory
  const scored: MatchedProviderPost[] = candidates
    .map((post: any) => {
      const { matches: skillMatches, score: skillScore } = skillOverlap(
        seekerPost.requiredSkills || [],
        post.skillTags || []
      );

      const levelMatch  = normalise(post.level || "") === seekerLevel;
      const roleMatch   = seekerRole
        ? normalise(post.role || "").includes(seekerRole) ||
          seekerRole.includes(normalise(post.role || ""))
        : false;
      const remoteMatch = seekerRemote === post.isRemote;

      const matchScore = computeMatchScore({
        skillScore,
        levelMatch,
        roleMatch,
        remoteMatch,
      });

      const isOwner = viewerUserId === post.userId;
      const validApplications = (post.Application || []).filter(
        (app: any) => app.applicant !== null
      );

      return {
        post: {
          ...post,
          owner: isOwner,
          Application: validApplications,
          applicationCount: validApplications.length,
        },
        matchScore,
        matchDetails: {
          skillMatches,
          skillScore,
          levelMatch,
          roleMatch,
          remoteMatch,
        },
      };
    })
    // Filter out posts with zero match score unless there are no better matches
    .filter((m) => m.matchScore > 0)
    // Sort by descending score, then boosted, then recent
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      if (b.post.isBoosted !== a.post.isBoosted) return b.post.isBoosted ? 1 : -1;
      return new Date(b.post.updatedAt).getTime() - new Date(a.post.updatedAt).getTime();
    });

  // 6. Paginate
  const safeLimit = Math.min(Math.max(1, limit), 50);
  const safePage  = Math.max(1, page);
  const skip      = (safePage - 1) * safeLimit;
  const paginated = scored.slice(skip, skip + safeLimit);

  return {
    seekerPost,
    matches: paginated,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount: scored.length,
      totalPages: Math.ceil(scored.length / safeLimit),
    },
  };
};

// ─── findMatchingSeekersForProvider ───────────────────────────────────────────

/**
 * Given a ProviderPost ID, return ACTIVE SeekerPost records ranked by how
 * well they match the provider's bench offering.
 */
export const findMatchingSeekersForProvider = async (
  providerPostId: string,
  viewerUserId: string,
  page = 1,
  limit = 10
): Promise<{
  providerPost: any;
  matches: MatchedSeekerPost[];
  pagination: { page: number; limit: number; totalCount: number; totalPages: number };
}> => {
  // 1. Load the provider post
  const providerPost = await prisma.providerPost.findUnique({
    where: { id: providerPostId },
  });

  if (!providerPost) {
    throw new Error("Provider post not found");
  }

  // 2. Gather matching signals
  const providerSkills = providerPost.skillTags || [];
  const providerRole   = normalise(providerPost.role  || "");
  const providerLevel  = normalise(providerPost.level || "");
  const providerRemote = providerPost.isRemote;

  // 3. Pre-filter at DB level
  const seekerWhere: any = {
    status: PostStatus.ACTIVE,
    isRemovedByAdmin: false,
    OR: [
      ...(providerSkills.length
        ? [
            { requiredSkills:  { hasSome: providerSkills } },
            { preferredSkills: { hasSome: providerSkills } },
          ]
        : []),
      ...(providerRole
        ? [{ role: { contains: providerRole, mode: "insensitive" as const } }]
        : []),
    ],
  };

  if (!seekerWhere.OR.length) {
    delete seekerWhere.OR;
  }

  // 4. Fetch candidates
  const candidates = await prisma.seekerPost.findMany({
    where: seekerWhere,
    include: seekerInclude,
    orderBy: [
      { isBoosted: "desc" },
      { postCategory: "desc" },
      { priority: "desc" },
      { updatedAt: "desc" },
    ],
  });

  // 5. Score in-memory
  const scored: MatchedSeekerPost[] = candidates
    .map((post: any) => {
      const { matches: skillMatches, score: skillScore } = skillOverlap(
        post.requiredSkills || [],
        providerSkills
      );

      const levelMatch  = normalise(post.level || "") === providerLevel;
      const roleMatch   = providerRole
        ? normalise(post.role || "").includes(providerRole) ||
          providerRole.includes(normalise(post.role || ""))
        : false;
      const remoteMatch = providerRemote === post.isRemote;

      const matchScore = computeMatchScore({
        skillScore,
        levelMatch,
        roleMatch,
        remoteMatch,
      });

      const isOwner = viewerUserId === post.userId;

      return {
        post: {
          ...post,
          owner: isOwner,
          applicationCount: (post.Application || []).length,
        },
        matchScore,
        matchDetails: {
          skillMatches,
          skillScore,
          levelMatch,
          roleMatch,
          remoteMatch,
        },
      };
    })
    .filter((m) => m.matchScore > 0)
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      if (b.post.isBoosted !== a.post.isBoosted) return b.post.isBoosted ? 1 : -1;
      return new Date(b.post.updatedAt).getTime() - new Date(a.post.updatedAt).getTime();
    });

  // 6. Paginate
  const safeLimit = Math.min(Math.max(1, limit), 50);
  const safePage  = Math.max(1, page);
  const skip      = (safePage - 1) * safeLimit;
  const paginated = scored.slice(skip, skip + safeLimit);

  return {
    providerPost,
    matches: paginated,
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount: scored.length,
      totalPages: Math.ceil(scored.length / safeLimit),
    },
  };
};
