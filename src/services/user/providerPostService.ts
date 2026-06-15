import { prisma } from "../../config/database";
import { checkPostEligibility, consumePostQuota } from "../post/postUsageService";
import { PostCategory, PostStatus } from "@prisma/client";
import { AppError } from "../../utils/errorHandler";
import { transitionExpiredUrgentPosts } from "../../utils/postCleanup";

export const createProviderPost = async (userId: string, data: any) => {
  const category = data.postCategory || PostCategory.BENCH;

  // 1. Check Eligibility (Free or Paid)
  const eligibility = await checkPostEligibility(userId, category, "provider");

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

  // 3. Create Post
  const post = await prisma.providerPost.create({
    data: {
      title: data.title,
      description: data.description,
      imageUrl: data.imageUrl,
      skillTags: data.skills || data.skillTags || [],
      role: data.role || "Developer",
      level: data.level || "Senior",
      numberOfEmployees: parseInt(data.numberOfEmployees) || 1,
      experience: parseInt(data.experience) || 0,
      availabilityStart: data.availabilityStart ? new Date(data.availabilityStart) : new Date(),
      availabilityEnd: data.availabilityEnd ? new Date(data.availabilityEnd) : new Date(new Date().setMonth(new Date().getMonth() + 3)),
      isRemote: data.isRemote !== undefined ? data.isRemote : true,
      location: data.location || "Remote",
      timezone: data.timezone || "IST",
      allocationPercent: parseInt(data.allocationPercent) || 100,
      notes: data.notes || "",
      isInternal: data.isInternal || false,
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

  return post;
};


// Get all provider posts (with computed status per userId)
export const getProviderPosts = async (viewerUserId: string) => {
  await transitionExpiredUrgentPosts();

  const posts = await prisma.providerPost.findMany({
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
  });

  return posts.map((post: any) => {
    const isOwner = viewerUserId === post.userId;

    // Filter out applications with missing applicants (orphaned records)
    const validApplications = post.Application.filter((app: any) => app.applicant !== null);

    return {
      ...post,
      owner: isOwner,
      Application: validApplications,
      applicationCount: validApplications.length,
    };
  });
};

// Get all provider posts created by a user
export const getProviderOwnPosts = async (userId: string) => {
  const posts = await prisma.providerPost.findMany({
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
      { isBoosted: "desc" },
      { postCategory: "desc" },
      { updatedAt: "desc" },
    ],
  });

  return posts.map((post: any) => {
    const isOwner = userId === post.userId;

    // Filter out applications with missing applicants (orphaned records)
    const validApplications = post.Application.filter((app: any) => app.applicant !== null);

    return {
      ...post,
      owner: isOwner,
      Application: validApplications,
      applicationCount: validApplications.length,
    };
  });
};

// Get single provider post by ID
export const getProviderPostById = async (id: string, viewerUserId: string) => {
  const post = await prisma.providerPost.findUnique({
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

  // Filter out applications with missing applicants (orphaned records)
  const validApplications = post.Application.filter((app: any) => app.applicant !== null);

  return {
    ...post,
    owner: isOwner,
    Application: validApplications,
    applicationCount: validApplications.length,
  };
};

export const getAllProviderPosts = async () => {
  await transitionExpiredUrgentPosts();

  return await prisma.providerPost.findMany({
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
    orderBy: [
      { isBoosted: "desc" },
      { postCategory: "desc" },
      { updatedAt: "desc" },
    ],
  });
};

// Update provider post (only by owner)
export const updateProviderPost = async (
  postId: string,
  userId: string,
  data: any
) => {
  const existingPost = await prisma.providerPost.findUnique({
    where: { id: postId },
    select: { id: true, userId: true, postCategory: true },
  });

  if (!existingPost) {
    throw new AppError("Post not found", 404);
  }

  if (existingPost.userId !== userId) {
    throw new AppError("You are not allowed to update this post", 403);
  }

  // ✅ NEW: Handle Category Upgrade (Bench -> Urgent)
  if (data.postCategory === PostCategory.URGENT && (existingPost as any).postCategory === PostCategory.BENCH) {
    console.log(`[Category Upgrade] Post ${postId} is being upgraded to URGENT. Checking eligibility...`);
    
    const eligibility = await checkPostEligibility(userId, PostCategory.URGENT, "provider");
    if (!eligibility.eligible) {
      throw new AppError("Insufficient quota to upgrade this post to URGENT. Please purchase an Urgent Post addon.", 402);
    }

    // Consume the quota
    await consumePostQuota(userId, PostCategory.URGENT, eligibility.subscriptionId, eligibility.reason);
    
    // Adjust expiry date for Urgent posts (7 days from now)
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + 7);
    data.expiryDate = newExpiry;
    
    console.log(`[Category Upgrade] Post ${postId} upgraded successfully. New expiry: ${newExpiry.toISOString()}`);
  }

  return await prisma.providerPost.update({
    where: {
      id: postId,
    },
    data,
  });
};

// Delete provider post (only by owner)
export const deleteProviderPost = async (postId: string, userId: string) => {
  return await prisma.providerPost.delete({
    where: {
      id: postId,
      userId, // ensures only owner can delete
    },
  });
};
