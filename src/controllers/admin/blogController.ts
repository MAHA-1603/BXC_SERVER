import { Request, Response } from "express";
import * as blogService from "../../services/admin/blogService";
import { handleError } from "../../utils/errorHandler";
import { logAudit } from "../../utils/auditHelper";

export async function createBlog(req: Request, res: Response) {
  try {
    const adminId = (req as any).user.id;
    const blog = await blogService.createBlog({
      ...req.body,
      authorId: adminId,
    });
    res.status(201).json({
      success: true,
      data: blog,
    });
    logAudit(req, {
      action: "BLOG_CREATED",
      category: "BLOG",
      targetId: blog.id,
      targetType: "Blog",
      description: `Created blog: ${blog.title}`,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error);
    res.status(status).json(body);
  }
}

export async function getAllBlogs(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const { blogs, total } = await blogService.getAllBlogs(page, limit);
    res.status(200).json({
      success: true,
      total,
      page,
      limit,
      data: blogs,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error);
    res.status(status).json(body);
  }
}

export async function getBlogById(req: Request, res: Response) {
  try {
    const blog = await blogService.getBlogById(req.params.id);
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }
    res.status(200).json({
      success: true,
      data: blog,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error);
    res.status(status).json(body);
  }
}

export async function updateBlog(req: Request, res: Response) {
  try {
    const blog = await blogService.updateBlog(req.params.id, req.body);
    logAudit(req, {
      action: "BLOG_UPDATED",
      category: "BLOG",
      targetId: req.params.id,
      targetType: "Blog",
      description: `Updated blog: ${blog.title}`,
      metadata: { updatedFields: Object.keys(req.body) },
    });
    res.status(200).json({
      success: true,
      data: blog,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error);
    res.status(status).json(body);
  }
}

export async function deleteBlog(req: Request, res: Response) {
  try {
    await blogService.deleteBlog(req.params.id);
    logAudit(req, {
      action: "BLOG_DELETED",
      category: "BLOG",
      targetId: req.params.id,
      targetType: "Blog",
      description: `Deleted blog ${req.params.id}`,
    });
    res.status(204).json({
      success: true,
      data: null,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error);
    res.status(status).json(body);
  }
}

export async function togglePublish(req: Request, res: Response) {
  try {
    const { isPublished } = req.body;
    const blog = await blogService.togglePublish(req.params.id, isPublished);
    logAudit(req, {
      action: isPublished ? "BLOG_PUBLISHED" : "BLOG_UNPUBLISHED",
      category: "BLOG",
      targetId: req.params.id,
      targetType: "Blog",
      description: `${isPublished ? "Published" : "Unpublished"} blog: ${blog.title}`,
    });
    res.status(200).json({
      success: true,
      data: blog,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error);
    res.status(status).json(body);
  }
}
