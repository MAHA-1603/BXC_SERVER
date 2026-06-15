import { Request, Response } from "express";
import * as blogService from "../../services/user/blogService";
import { handleError } from "../../utils/errorHandler";

export async function getPublishedBlogs(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const { blogs, total } = await blogService.getPublishedBlogs(page, limit);
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

export async function getBlogBySlug(req: Request, res: Response) {
  try {
    const blog = await blogService.getBlogBySlug(req.params.slug);
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
