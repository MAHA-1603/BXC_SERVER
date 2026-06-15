import { Request, Response } from "express";
import { DealStage } from "@prisma/client";
import {
  offerDeal,
  confirmDeal,
  rejectDealOffer,
  cancelOffer,
  updateDealStage,
  escalateDeal,
} from "../../services/user/dealLifeCycleService";
import { prisma } from "../../config/database";
import { handleError } from "../../utils/errorHandler";
import { logAudit } from "../../utils/auditHelper";

/**
 * GET /api/deal/:id
 * Fetch deal lifecycle details by ID
 */
export async function offerDealController(req: Request, res: Response) {
  try {
    const { applicationId } = req.body;
    const ownerId = (req as any).user.id;
    const app = await offerDeal(applicationId, ownerId);
    logAudit(req, {
      action: "DEAL_OFFERED",
      category: "DEAL",
      targetId: applicationId,
      targetType: "Application",
      description: `Offered deal for application ${applicationId}`,
    });
    res
      .status(201)
      .json({ message: "Offer sent to applicant", application: app });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to offer deal");
    res.status(status).json(body);
  }
}

export async function confirmDealController(req: Request, res: Response) {
  try {
    const { applicationId } = req.params;
    const applicantId = (req as any).user.id;
    const deal = await confirmDeal(applicationId, applicantId);
    logAudit(req, {
      action: "DEAL_CONFIRMED",
      category: "DEAL",
      targetId: deal.id,
      targetType: "DealLifecycle",
      description: `Confirmed deal ${deal.id} for application ${applicationId}`,
    });
    res.json({ message: "Deal confirmed", deal });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to confirm deal");
    res.status(status).json(body);
  }
}

export async function rejectDealOfferController(req: Request, res: Response) {
  try {
    const { applicationId } = req.params;
    const applicantId = (req as any).user.id;
    const app = await rejectDealOffer(applicationId, applicantId);
    logAudit(req, {
      action: "DEAL_REJECTED",
      category: "DEAL",
      targetId: applicationId,
      targetType: "Application",
      description: `Rejected deal offer for application ${applicationId}`,
    });
    res.json({ message: "Offer rejected", application: app });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to reject offer");
    res.status(status).json(body);
  }
}

export async function cancelOfferController(req: Request, res: Response) {
  try {
    const { applicationId } = req.params;
    const ownerId = (req as any).user.id;
    const app = await cancelOffer(applicationId, ownerId);
    logAudit(req, {
      action: "DEAL_CANCELLED",
      category: "DEAL",
      targetId: applicationId,
      targetType: "Application",
      description: `Cancelled deal offer for application ${applicationId}`,
    });
    res.json({ message: "Offer cancelled", application: app });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to cancel offer");
    res.status(status).json(body);
  }
}

export async function getDealById(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const deal = await prisma.dealLifecycle.findUnique({
      where: { id },
      include: {
        application: {
          include: {
            applicant: {
              select: {
                id: true,
                fullName: true,
                companyName: true,
                email: true,
                profilePicture: true,
              },
            },
            providerPost: { select: { id: true, title: true } },
            seekerPost: { select: { id: true, title: true } },
          },
        },
      },
    });

    if (!deal)
      return res
        .status(404)
        .json({ success: false, message: "Deal not found" });

    res.json({ success: true, data: deal });
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to fetch deal");
    res.status(status).json(body);
  }
}

/**
 * PATCH /api/deal/:id/updateStage
 * Update stage manually (by either party)
 */
export async function updateDealStageController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { stage, reason } = req.body;

    // Validate stage input
    if (!stage)
      return res
        .status(400)
        .json({ success: false, message: "Stage is required" });

    if (!Object.values(DealStage).includes(stage)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid stage value" });
    }

    const updated = await updateDealStage(id, stage as DealStage, reason);
    logAudit(req, {
      action: "DEAL_STAGE_UPDATED",
      category: "DEAL",
      targetId: id,
      targetType: "DealLifecycle",
      description: `Updated deal ${id} stage to ${stage}`,
      metadata: { stage, reason },
    });
    res.json({
      success: true,
      message: "Deal stage updated successfully",
      data: updated,
    });
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to update deal stage");
    res.status(status).json(body);
  }
}

/**
 * POST /api/deal/:id/escalate
 * Escalate or resolve a deal issue
 */
export async function escalateDealController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const escalatedById = (req as any).user.id;
    const { issueCategory, moderatorNotes } = req.body;

    if (!issueCategory)
      return res
        .status(400)
        .json({ success: false, message: "Issue category is required" });

    const updated = await escalateDeal(
      id,
      escalatedById,
      issueCategory,
      moderatorNotes
    );
    logAudit(req, {
      action: "DEAL_ESCALATED",
      category: "DEAL",
      targetId: id,
      targetType: "DealLifecycle",
      description: `Escalated deal ${id}`,
      metadata: { issueCategory, moderatorNotes },
    });
    res.json({
      success: true,
      message: "Deal escalated successfully",
      data: updated,
    });
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Failed to escalate deal");
    res.status(status).json(body);
  }
}
