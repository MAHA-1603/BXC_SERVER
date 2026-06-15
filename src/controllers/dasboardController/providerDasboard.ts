import { Request, Response, NextFunction } from "express";
import { getProviderDashboard } from "../../services/dashboard/userDashboard";
import { handleError } from "../../utils/errorHandler";

export async function providerDashboardController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const userId = (req as any).user.id; // assuming auth middleware adds user info here

  try {
    const dashboardData = await getProviderDashboard(userId);
    res.status(200).json({
      success: true,
      data: dashboardData,
    });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to fetch dashboard data");
    res.status(status).json(body);
  }
}
