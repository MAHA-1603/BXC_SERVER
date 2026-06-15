import { prisma } from "../config/database";
import { PostCategory } from "@prisma/client";

/**
 * Automatically transitions expired URGENT posts to BENCH (normal) posts.
 * This ensures that urgent posts only stay at the top for their intended 7-day period.
 * Bench posts are then deactivated after their 30-day period.
 */
export const transitionExpiredUrgentPosts = async () => {
  const now = new Date();

  try {
    // 1. Transition Provider URGENT posts to BENCH
    // We fetch them first because we need to calculate the new expiry date based on createdAt
    const expiredUrgentProviderPosts = await prisma.providerPost.findMany({
      where: {
        postCategory: PostCategory.URGENT,
        expiryDate: { lte: now },
        status: "ACTIVE",
      },
      select: { id: true, createdAt: true },
    });

    if (expiredUrgentProviderPosts.length > 0) {
      for (const post of expiredUrgentProviderPosts) {
        const newExpiryDate = new Date(post.createdAt);
        newExpiryDate.setDate(newExpiryDate.getDate() + 30);

        await prisma.providerPost.update({
          where: { id: post.id },
          data: {
            postCategory: PostCategory.BENCH,
            expiryDate: newExpiryDate,
          },
        });
      }
      console.log(`[Cleanup] Transitioned ${expiredUrgentProviderPosts.length} provider posts from URGENT to BENCH`);
    }

    // 2. Transition Seeker URGENT posts to BENCH
    const expiredUrgentSeekerPosts = await prisma.seekerPost.findMany({
      where: {
        postCategory: PostCategory.URGENT,
        expiryDate: { lte: now },
        status: "ACTIVE",
      },
      select: { id: true, createdAt: true },
    });

    if (expiredUrgentSeekerPosts.length > 0) {
      for (const post of expiredUrgentSeekerPosts) {
        const newExpiryDate = new Date(post.createdAt);
        newExpiryDate.setDate(newExpiryDate.getDate() + 30);

        await prisma.seekerPost.update({
          where: { id: post.id },
          data: {
            postCategory: PostCategory.BENCH,
            expiryDate: newExpiryDate,
          },
        });
      }
      console.log(`[Cleanup] Transitioned ${expiredUrgentSeekerPosts.length} seeker posts from URGENT to BENCH`);
    }

  } catch (error: any) {
    console.error("[Cleanup] Error transitioning expired urgent posts:", error.message);
  }
};
