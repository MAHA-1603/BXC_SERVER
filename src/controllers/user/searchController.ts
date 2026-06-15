import { Request, Response } from "express";
import {
  searchProviderPosts,
  searchSeekerPosts,
  SearchParams,
} from "../../services/user/searchService";
import { handleError } from "../../utils/errorHandler";

// Search Provider Posts Controller
export const searchProviderPostsController = async (req: Request, res: Response) => {
  try {
    const viewerUserId = (req as any).user.id;
    
    // Extract query parameters
    const params: SearchParams = {
      q: req.query.q as string | undefined,
      skill: req.query.skill as string | undefined,
      title: req.query.title as string | undefined,
      role: req.query.role as string | undefined,
      experience: req.query.experience ? parseInt(req.query.experience as string, 10) : undefined,
      location: req.query.location as string | undefined,
      level: req.query.level as string | undefined,
      isRemote: req.query.isRemote !== undefined 
        ? req.query.isRemote === "true" 
        : undefined,
      isBoosted: req.query.isBoosted !== undefined
        ? req.query.isBoosted === "true"
        : undefined,
      isUrgent: req.query.isUrgent !== undefined
        ? req.query.isUrgent === "true"
        : undefined,
      status: req.query.status as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };

    const result = await searchProviderPosts(viewerUserId, params);
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to search provider posts");
    res.status(status).json(body);
  }
};

// Search Seeker Posts Controller
export const searchSeekerPostsController = async (req: Request, res: Response) => {
  try {
    const viewerUserId = (req as any).user.id;
    
    // Extract query parameters
    const params: SearchParams = {
      q: req.query.q as string | undefined,
      skill: req.query.skill as string | undefined,
      title: req.query.title as string | undefined,
      role: req.query.role as string | undefined,
      experience: req.query.experience ? parseInt(req.query.experience as string, 10) : undefined,
      location: req.query.location as string | undefined,
      level: req.query.level as string | undefined,
      isRemote: req.query.isRemote !== undefined 
        ? req.query.isRemote === "true" 
        : undefined,
      isBoosted: req.query.isBoosted !== undefined
        ? req.query.isBoosted === "true"
        : undefined,
      isUrgent: req.query.isUrgent !== undefined
        ? req.query.isUrgent === "true"
        : undefined,
      status: req.query.status as string | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    };

    const result = await searchSeekerPosts(viewerUserId, params);
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to search seeker posts");
    res.status(status).json(body);
  }
};
