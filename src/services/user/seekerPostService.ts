import { prisma } from "../../config/database";
import { checkPostEligibility, consumePostQuota } from "../post/postUsageService";
import { PostCategory, PostStatus } from "@prisma/client";
import { AppError } from "../../utils/errorHandler";
import { transitionExpiredUrgentPosts } from "../../utils/postCleanup";

export const createSeekerPost = async (userId: string, data: any) => {
  const category = data.postCategory || PostCategory.BENCH;

  // 1. Check Eligibility (Free or Paid)
  const eligibility = await checkPostEligibility(userId, category, "seeker");

  if (!eligibility.eligible) {
    throw new AppError("Post limit reached. Please purchase an add-on or upgrade your plan to continue posting.", 402);
  }

  // 2. Set Expiry Date
  const expiryDate = new Date();
  if (category === PostCategory.BENCH) {
    expiryDate.setDate(expiryDate.getDate() + 30);
  } else {
    expiryDate.setDate(expiryDate.getDate() + 7);
  }

  // 3. Create Seeker Post
  const seekerPost = await prisma.seekerPost.create({
    data: {
      ...data,
      userId,
      postCategory: category,
      expiryDate,
      isFree: eligibility.isFree || false,
      paymentId: data.paymentId || null,
    } as any,
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
    },
  });

  // 4. Consume quota based on which layer was used
  const shouldConsume = eligibility.isFree || eligibility.reason === "PLAN_ALLOTMENT" || eligibility.reason === "UNLIMITED_PLAN";
  if (shouldConsume) {
    await consumePostQuota(userId, category, eligibility.subscriptionId, eligibility.reason);
  }

  return seekerPost;
};

// Get all seeker posts with computed status per viewer user
export const getSeekerPosts = async (viewerUserId: string) => {
  await transitionExpiredUrgentPosts();

  const posts = await prisma.seekerPost.findMany({
    where: {
      status: PostStatus.ACTIVE,
    },
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
          status: true,
          applicantId: true,
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
      { priority: "desc" },     // 🥉 Medium: Priority field
      { updatedAt: "desc" },    // Normal + 🔄 Refreshed (Bumped back to top)
    ],
  });

  return posts.map((post: any) => {
    const isOwner = post.userId === viewerUserId;
    return {
      ...post,
      owner: isOwner,
      applicationCount: post.Application.length,
    };
  });
};

// Get seeker posts created by a user
export const getSeekerOwnPosts = async (userId: string) => {
  const posts = await prisma.seekerPost.findMany({
    where: { userId },
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
          conversationId: true,
          status: true,
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
      { isBoosted: "desc" },
      { postCategory: "desc" },
      { priority: "desc" },
      { updatedAt: "desc" },
    ],
  });

  return posts.map((post: any) => {
    const isOwner = userId === post.userId;
    return {
      ...post,
      owner: isOwner,
      applicationCount: post.Application.length,
    };
  });
};

// Get a single seeker post by ID
export const getSeekerPostById = async (id: string, viewerUserId: string) => {
  const post = await prisma.seekerPost.findUnique({
    where: { id },
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
  });

  if (!post) return null;

  const isOwner = post.userId === viewerUserId;

  return {
    ...post,
    owner: isOwner,
    applicationCount: post.Application.length,
  };
};

// export const getSeekerOwnPosts = async (userId : string) => {
//   return await prisma.seekerPost.findMany({
//     where : {userId},
//     include: {
//       user: {
//         select: {
//           id: true,
//           fullName: true,
//           email: true,
//           companyName: true,
//           profilePicture: true,
//         },
//       },
//     },
//   });
// };

export const getAllSeekerPosts = async () => {
  await transitionExpiredUrgentPosts();

  return await prisma.seekerPost.findMany({
    where: {
      status: PostStatus.ACTIVE,
    },
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
    },
  });
};

// export const getSeekerPostById = async (id: string) => {
//   return await prisma.seekerPost.findUnique({
//     where: { id },
//     include: {
//       user: {
//         select: {
//           id: true,
//           fullName: true,
//           email: true,
//           companyName: true,
//           profilePicture: true,
//         },
//       },
//     },
//   });
// };

export const updateSeekerPost = async (id: string, userId: string, data: any) => {
  const existingPost = await prisma.seekerPost.findUnique({
    where: { id },
    select: { id: true, userId: true, postCategory: true },
  });

  if (!existingPost) {
    throw new AppError("Post not found", 404);
  }

  if (existingPost.userId !== userId) {
    throw new AppError("You are not allowed to update this post", 403);
  }

  // ✅ NEW: Handle Category Upgrade (Bench -> Urgent)
  if (data.postCategory === PostCategory.URGENT && existingPost.postCategory === PostCategory.BENCH) {
    console.log(`[Category Upgrade] Seeker Post ${id} is being upgraded to URGENT. Checking eligibility...`);
    
    const eligibility = await checkPostEligibility(userId, PostCategory.URGENT, "seeker");
    if (!eligibility.eligible) {
      throw new AppError("Insufficient quota to upgrade this post to URGENT. Please purchase an Urgent Post addon.", 402);
    }

    // Consume the quota
    await consumePostQuota(userId, PostCategory.URGENT, eligibility.subscriptionId, eligibility.reason);
    
    // Adjust expiry date for Urgent posts (7 days from now)
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + 7);
    data.expiryDate = newExpiry;
    
    console.log(`[Category Upgrade] Seeker Post ${id} upgraded successfully. New expiry: ${newExpiry.toISOString()}`);
  }

  return await prisma.seekerPost.update({
    where: { id },
    data,
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
    },
  });
};

export const deleteSeekerPost = async (id: string) => {
  return await prisma.seekerPost.delete({
    where: { id },
  });
};
