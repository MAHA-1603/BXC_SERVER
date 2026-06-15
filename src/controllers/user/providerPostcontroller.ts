import { Request, Response } from "express";
import {
  createProviderPost,
  getProviderPosts,
  getProviderOwnPosts,
  updateProviderPost,
  getProviderPostById,
  deleteProviderPost,
  getAllProviderPosts as getAllProviderPostsService
} from "../../services/user/providerPostService";
import { handleError } from "../../utils/errorHandler";
import { logAudit } from "../../utils/auditHelper";

export const createPostController = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id; // from authMiddleware
    const post = await createProviderPost(userId, req.body);
    logAudit(req, {
      action: "PROVIDER_POST_CREATED",
      category: "USER_ACTIVITY",
      targetId: post.id,
      targetType: "ProviderPost",
      description: `Created provider post: ${post.title}`,
    });
    res.status(201).json({ success: true, data: post });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to create post");
    res.status(status).json(body);
  }
};

export const getAllProviderPosts = async (req: Request, res: Response) => {
  try {
    const posts = await getAllProviderPostsService();
    res.json({ success: true, data: posts });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to fetch posts");
    res.status(status).json(body);
  }
}

export const getMyProviderPosts = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id; // from authMiddleware
    const posts = await getProviderOwnPosts(userId);
    res.json({ success: true, data: posts });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to fetch your posts");
    res.status(status).json(body);
  }
};

export const getPostsController = async (req: Request, res: Response) => {
  try {
    const posts = await getProviderPosts((req as any).user.id ); ;
    res.json({ success: true, data: posts });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to fetch posts");
    res.status(status).json(body);
  }
};

export const getPostsByIdController = async (req: Request, res: Response) => {
  try {
    const post = await getProviderPostById(req.params.id, (req as any).user.id);
    if (!post) return res.status(404).json({ success: false, message: "Post not found" });
    res.json({ success: true, data: post });
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to fetch post");
    res.status(status).json(body);
  }
};

export const updatePostController = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const postId = req.params.id;
    const updated = await updateProviderPost(postId, userId, req.body);
    logAudit(req, {
      action: "PROVIDER_POST_UPDATED",
      category: "USER_ACTIVITY",
      targetId: postId,
      targetType: "ProviderPost",
      description: `Updated provider post: ${updated.title}`,
    });
    res.json({ success: true, data: updated });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to update post");
    res.status(status).json(body);
  }
};

export const deletePostController = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const postId = req.params.id;
    await deleteProviderPost(postId, userId);
    logAudit(req, {
      action: "PROVIDER_POST_DELETED",
      category: "USER_ACTIVITY",
      targetId: postId,
      targetType: "ProviderPost",
      description: `Deleted provider post ${postId}`,
    });
    res.json({ success: true, message: "Post deleted successfully" });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to delete post");
    res.status(status).json(body);
  }
};
