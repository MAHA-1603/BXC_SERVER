import { Request, Response } from "express";
import { getUserDashboardStats } from "../../services/user/userDashboardService";
import { handleError } from "../../utils/errorHandler";

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    if (!userId) {
      return res.status(401).json({ 
        status: "error",
        message: "User not authenticated" 
      });
    }

    const stats = await getUserDashboardStats(userId);
    
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
