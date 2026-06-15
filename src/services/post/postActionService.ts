import { prisma } from "../../config/database";
import { PaymentType, PostType } from "@prisma/client";

export const boostPost = async (postId: string, postType: PostType, userId: string, paymentId?: string) => {
  // 1. Check for Active Subscription
  const activeSub = await prisma.subscription.findFirst({
    where: { userId, status: "ACTIVE" },
  });
  if (!activeSub) {
    throw new Error("Active subscription required to boost posts.");
  }

  // 2. Check if post is currently actively boosted
  if (postType === PostType.PROVIDER) {
    const post = await prisma.providerPost.findUnique({ where: { id: postId } });
    if (!post) throw new Error("Post not found.");
    if (post.isBoosted) {
      throw new Error("This post is already actively boosted.");
    }
  } else {
    const post = await prisma.seekerPost.findUnique({ where: { id: postId } });
    if (!post) throw new Error("Post not found.");
    if (post.isBoosted) {
      throw new Error("This post is already actively boosted.");
    }
  }

  // 3. Check for Boost Limits on User
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || (user.combinedBoostsRemaining || 0) <= 0) {
    throw new Error("You do not have any Boost limits remaining. Please purchase a Boost Addon.");
  }

  // 2. Decrement limit
  await prisma.user.update({
    where: { id: userId },
    data: {
      combinedBoostsRemaining: {
        decrement: 1,
      },
    },
  });

  if (postType === PostType.PROVIDER) {
    return await prisma.providerPost.update({
      where: { id: postId },
      data: {
        isBoosted: true,
        boostExpiry: null, // Boosts last for the lifetime of the post
        ...(paymentId && { paymentId }), // save paymentId if provided
      },
    });
  } else {
    return await prisma.seekerPost.update({
      where: { id: postId },
      data: {
        isBoosted: true,
        boostExpiry: null,
        ...(paymentId && { paymentId }),
      },
    });
  }
};

export const refreshPost = async (postId: string, postType: PostType, userId: string, paymentId?: string) => {
  // 1. Check for Active Subscription
  const activeSub = await prisma.subscription.findFirst({
    where: { userId, status: "ACTIVE" },
  });
  if (!activeSub) {
    throw new Error("Active subscription required to refresh posts.");
  }

  // 2. Check for Refresh Limits on User
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || (user.combinedRefreshesRemaining || 0) <= 0) {
    throw new Error("You do not have any Refresh limits remaining. Please purchase a Refresh Addon.");
  }

  // 2. Decrement limit
  await prisma.user.update({
    where: { id: userId },
    data: {
      combinedRefreshesRemaining: {
        decrement: 1,
      },
    },
  });

  if (postType === PostType.PROVIDER) {
    return await prisma.providerPost.update({
      where: { id: postId },
      data: {
        lastRefreshedAt: new Date(),
        updatedAt: new Date(),
        ...(paymentId && { paymentId }),
      },
    });
  } else {
    return await prisma.seekerPost.update({
      where: { id: postId },
      data: {
        lastRefreshedAt: new Date(),
        updatedAt: new Date(),
        ...(paymentId && { paymentId }),
      },
    });
  }
};
