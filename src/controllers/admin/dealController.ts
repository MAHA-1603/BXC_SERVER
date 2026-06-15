import { Request, Response } from "express";
import {
  getAllEscalatedAndResolvedDeals,
  resolveEscalatedDeal,
  getOverdueDealsForAdmin,
  getStuckDealsForAdmin,
} from "../../services/admin/dealService";
import { handleError } from "../../utils/errorHandler";
import { logAudit } from "../../utils/auditHelper";

/**
 * GET /api/admin/deals/escalated
 * List all escalated deals for admin review
 */
export async function getEscalatedDealsController(req: Request, res: Response) {
  try {
    const adminId = (req as any).user.id; // assuming you attach admin info from auth middleware
    const deals = await getAllEscalatedAndResolvedDeals(adminId);
    res.json({ success: true, data: deals });
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to fetch escalated deals");
    res.status(status).json(body);
  }
}

// Controller to get all stuck deals for an admin
export async function getStuckDealsController(req: Request, res: Response) {
  try {
    const adminId = (req as any).user?.id; // Assuming admin id is set on req.user from auth middleware
    if (!adminId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const stuckDeals = await getStuckDealsForAdmin(adminId);
    return res.json(stuckDeals);
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to fetch stuck deals");
    return res.status(status).json(body);
  }
}

export async function overdueDealsController(req: Request, res: Response) {
  try {
    const adminId = (req as any).user.id; // assuming you attach admin info from auth middleware
    const categorizedDeals = await getOverdueDealsForAdmin(adminId);
    res.json(categorizedDeals);
  } catch (err) {
    const { status, body } = handleError.full(err, "Failed to fetch overdue deals");
    res.status(status).json(body);
  }
}

/**
 * PATCH /api/admin/deals/:id/resolve
 * Resolve, drop, or blacklist an escalated deal
 */
export async function resolveEscalatedDealController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { action, moderatorNotes } = req.body;
    const adminId = (req as any).user?.id; // assuming you attach admin info from auth middleware

    if (!["resolved", "dropped", "blacklist"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin action. Use resolved, dropped, or blacklist.",
      });
    }

    const updated = await resolveEscalatedDeal(id, adminId, action, moderatorNotes);
    logAudit(req, {
      action: `DEAL_${action.toUpperCase()}`,
      category: "DEAL",
      targetId: id,
      targetType: "DealLifecycle",
      description: `Deal ${action}: ${id}`,
      metadata: { moderatorNotes },
    });
    res.json({
      success: true,
      message: `Deal ${action} successfully`,
      data: updated,
    });
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to resolve deal");
    res.status(status).json(body);
  }
}
