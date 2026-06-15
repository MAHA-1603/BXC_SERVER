import { Request, Response } from "express";
import * as adminService from "../../services/admin/paymentInfoService";
import { handleError } from "../../utils/errorHandler";

// /admin/payments?userid=...
export async function getUserPayments(req: Request, res: Response) {
  try {
    const userId = req.query.userId as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    if (!userId) {
      return res.status(400).json({ success: false, message: "Missing userId parameter" });
    }
    const payments = await adminService.getAllUserPayments(page, limit);
    const filtered = payments.filter((p) => p.userId === userId);
    res.json(filtered);
  } catch (error: any) {
    const { status, body } = handleError.full(error);
    res.status(status).json(body);
  }
}

// /admin/subscriptions?userid=...
export async function getUserSubscriptions(req: Request, res: Response) {
  try {
    const userId = req.query.userId as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    if (!userId) {
      return res.status(400).json({ error: "Missing userId parameter" });
    }
    const subs = await adminService.getUserSubscriptions(userId, page, limit);
    res.json(subs);
  } catch (error: any) {
    const { status, body } = handleError.full(error);
    res.status(status).json(body);
  }
}


export async function getUserAddonPurchases(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const response = await adminService.getAllUsersAddonPurchaseHistory(
      page,
      limit
    );
    res.json(response);
  } catch (error: any) {
    const { status, body } = handleError.full(error);
    res.status(status).json(body);
  }
}

export async function getRevenue(req: Request, res: Response) {
  try {
    // Parse year and month from query params if provided
    const year = req.query.year
      ? parseInt(req.query.year as string)
      : undefined;
    const month = req.query.month
      ? parseInt(req.query.month as string)
      : undefined;

    const revenue = await adminService.getRevenueProjection(year, month);
    res.json(revenue);
  } catch (error: any) {
    const { status, body } = handleError.full(error);
    res.status(status).json(body);
  }
}

// /admin/subscriptions
export async function getAllSubscriptions(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const response = await adminService.getAllUsersSubscriptions(page, limit);
    res.json(response);
  } catch (error: any) {
    const { status, body } = handleError.full(error);
    res.status(status).json(body);
  }
}

export async function getUnifiedAddonHistory(req: Request, res: Response) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const response = await adminService.getUnifiedAddonHistory(page, limit);
    res.json(response);
  } catch (error: any) {
    const { status, body } = handleError.full(error);
    res.status(status).json(body);
  }
}
