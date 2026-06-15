import { Request, Response } from "express";
import * as service from "../../services/user/seekerPostService";
import { handleError } from "../../utils/errorHandler";
import { logAudit } from "../../utils/auditHelper";

import {
  getProviderReceivedApplications,
  getProviderAppliedApplications,
  getSeekerReceivedApplications,
  getSeekerAppliedApplications,
} from "../../services/user/applicationService";

export const createPost = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id; // from auth middleware
    const post = await service.createSeekerPost(userId, req.body);
    logAudit(req, {
      action: "SEEKER_POST_CREATED",
      category: "USER_ACTIVITY",
      targetId: post.id,
      targetType: "SeekerPost",
      description: `Created seeker post: ${post.title}`,
    });
    res.status(201).json({ success: true, data: post });
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to create post");
    res.status(status).json(body);
  }
};

export const getMyPosts = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id; // from auth middleware
    const posts = await service.getSeekerOwnPosts(userId);
    res.json({ success: true, data: posts });
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to fetch your posts");
    res.status(status).json(body);
  }
};

export const getPosts = async (req: Request, res: Response) => {
  try {
    const posts = await service.getSeekerPosts((req as any).user.id);
    res.json({ success: true, data: posts });
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to fetch posts");
    res.status(status).json(body);
  }
};

export const getAllPosts = async (req: Request, res: Response) => {
  try {
    const posts = await service.getAllSeekerPosts();
    res.json({ success: true, data: posts });
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to fetch all posts");
    res.status(status).json(body);
  }
};

export const getPostById = async (req: Request, res: Response) => {
  try {
    const post = await service.getSeekerPostById(
       req.params.id,
      (req as any).user.id,
    );
    if (!post)
      return res
        .status(404)
        .json({ success: false, message: "Post not found" });
    res.json({ success: true, data: post });
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to fetch post");
    res.status(status).json(body);
  }
};

export const updatePost = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const post = await service.updateSeekerPost(req.params.id, userId, req.body);
    logAudit(req, {
      action: "SEEKER_POST_UPDATED",
      category: "USER_ACTIVITY",
      targetId: req.params.id,
      targetType: "SeekerPost",
      description: `Updated seeker post: ${post.title}`,
    });
    res.json({ success: true, data: post });
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to update post");
    res.status(status).json(body);
  }
};

export const deletePost = async (req: Request, res: Response) => {
  try {
    await service.deleteSeekerPost(req.params.id);
    logAudit(req, {
      action: "SEEKER_POST_DELETED",
      category: "USER_ACTIVITY",
      targetId: req.params.id,
      targetType: "SeekerPost",
      description: `Deleted seeker post ${req.params.id}`,
    });
    res.json({ success: true, message: "Seeker post deleted successfully" });
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to delete post");
    res.status(status).json(body);
  }
};


