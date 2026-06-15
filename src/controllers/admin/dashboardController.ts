import { Request, Response } from "express";
import { getAdminDashboardStats } from "../../services/admin/dashboardService";
import { handleError } from "../../utils/errorHandler";

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const stats = await getAdminDashboardStats();
    
    res.status(200).json({
      status: "success",
      data: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to fetch dashboard statistics");
    res.status(status).json(body);
  }
};
