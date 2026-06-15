import { Request, Response } from "express";
import { PostType } from "@prisma/client";
import * as postActionService from "../../services/post/postActionService";
import { prisma } from "../../config/database";
import { handleError } from "../../utils/errorHandler";

export const boostPostController = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id: postId } = req.params;
    const { postType: bodyType, paymentId } = req.body || {};
    
    // Automatically infer postType from the URL if not provided in body
    let postType = bodyType;
    if (!postType) {
      if (req.originalUrl.includes("/provider/")) postType = PostType.PROVIDER;
      else if (req.originalUrl.includes("/seeker/")) postType = PostType.SEEKER;
    }

    if (!postType || !Object.values(PostType).includes(postType)) {
      return res.status(400).json({ success: false, message: "Could not determine postType. Use /provider/ or /seeker/ routes or send postType in body." });
    }

    // Owner check
    const post = postType === PostType.PROVIDER 
      ? await prisma.providerPost.findUnique({ where: { id: postId } })
      : await prisma.seekerPost.findUnique({ where: { id: postId } });

    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found." });
    }

    if (post.userId !== userId) {
      return res.status(403).json({ success: false, message: "You are not authorized to boost this post." });
    }

    const updatedPost = await postActionService.boostPost(postId, postType, userId, paymentId);
    res.json({ success: true, data: updatedPost, message: "Post boosted successfully for 7 days." });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to boost post");
    res.status(status).json(body);
  }
};

export const refreshPostController = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { id: postId } = req.params;
    const { postType: bodyType, paymentId } = req.body || {};

    // Automatically infer postType from the URL if not provided in body
    let postType = bodyType;
    if (!postType) {
      if (req.originalUrl.includes("/provider/")) postType = PostType.PROVIDER;
      else if (req.originalUrl.includes("/seeker/")) postType = PostType.SEEKER;
    }

    if (!postType || !Object.values(PostType).includes(postType)) {
      return res.status(400).json({ success: false, message: "Could not determine postType. Use /provider/ or /seeker/ routes or send postType in body." });
    }

    // Owner check
    const post = postType === PostType.PROVIDER 
      ? await prisma.providerPost.findUnique({ where: { id: postId } })
      : await prisma.seekerPost.findUnique({ where: { id: postId } });

    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found." });
    }

    if (post.userId !== userId) {
      return res.status(403).json({ success: false, message: "You are not authorized to refresh this post." });
    }

    const updatedPost = await postActionService.refreshPost(postId, postType, userId, paymentId);
    res.json({ success: true, data: updatedPost, message: "Post refreshed successfully (moved to top)." });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to refresh post");
    res.status(status).json(body);
  }
};
