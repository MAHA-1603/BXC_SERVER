import { Request, Response } from "express";
import * as analyticsService from "../../services/admin/adminAnalyticsService";
import { handleError } from "../../utils/errorHandler";
import { logAudit } from "../../utils/auditHelper";

// 1. Get Platform Overview (Total Users, Posts, Apps)
export const getOverview = async (req: Request, res: Response) => {
  try {
    const data = await analyticsService.getPlatformOverview();

    // Log this action occasionally to audit if needed (optional for pure reads)
    // logAudit(req, {
    //   action: "ADMIN_VIEWED_ANALYTICS",
    //   category: "SYSTEM",
    //   targetType: "Dashboard",
    //   description: "Admin viewed platform overview analytics",
    // });

    return res.status(200).json({
      success: true,
      message: "Platform overview fetched successfully",
      data,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to fetch platform overview");
    return res.status(status).json(body);
  }
};

// 2. Get Trending Skills (Most frequent tags)
export const getTrendingSkills = async (req: Request, res: Response) => {
  try {
    const data = await analyticsService.getTrendingSkills();

    return res.status(200).json({
      success: true,
      message: "Trending skills fetched successfully",
      data,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to fetch trending skills");
    return res.status(status).json(body);
  }
};

// 3. Get Sector/Role Trends (Which jobs are hot)
export const getSectorTrends = async (req: Request, res: Response) => {
  try {
    const data = await analyticsService.getSectorTrends();

    return res.status(200).json({
      success: true,
      message: "Sector trends fetched successfully",
      data,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to fetch sector trends");
    return res.status(status).json(body);
  }
};

// 4. Get Platform Growth Timeline (30 days)
export const getGrowthTimeline = async (req: Request, res: Response) => {
  try {
    const data = await analyticsService.getPlatformGrowth();

    return res.status(200).json({
      success: true,
      message: "Growth timeline fetched successfully",
      data,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to fetch growth timeline");
    return res.status(status).json(body);
  }
};
