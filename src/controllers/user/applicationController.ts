import { Request, Response } from "express";
import { handleError } from "../../utils/errorHandler";
import { logAudit } from "../../utils/auditHelper";
import {
  createApplication,
  applyToProviderPost,
  applyToSeekerPost,

  updateApplicationStatus,
  getProviderReceivedApplications,
  getProviderAppliedApplications,
  getSeekerReceivedApplications,
  getSeekerAppliedApplications,
  getApplicationById,
} from "../../services/user/applicationService";

export const applyController = async (req: Request, res: Response) => {
  try {
    const { postId, postType, message } = req.body;
    const applicantId = (req as any).user.id;
    const app = await createApplication(applicantId, postId, postType, message);
    logAudit(req, {
      action: "APPLICATION_SUBMITTED",
      category: "USER_ACTIVITY",
      targetId: app.id,
      targetType: "Application",
      description: `User submitted application for ${postType} post ${postId}`,
      metadata: { postId, postType },
    });
    res.json({ success: true, data: app });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to apply");
    res.status(status).json(body);
  }
};

// Controller to apply for a provider post
export async function applyProviderPostController(req: Request, res: Response) {
  try {
    const { providerPostId, message } = req.body;
    const applicantId = (req as any).user.id;
    if (!applicantId || !providerPostId) {
      return res
        .status(400)
        .json({
          success: false,
          message: "applicantId and providerPostId are required for the applying",
        });
    }

    const application = await applyToProviderPost(
      applicantId,
      providerPostId,
      message
    );
    logAudit(req, {
      action: "APPLIED_PROVIDER_POST",
      category: "USER_ACTIVITY",
      targetId: application.id,
      targetType: "Application",
      description: `Applied to provider post ${providerPostId}`,
      metadata: { providerPostId },
    });
    return res.status(201).json({
      success: true,
      message: "successfully applied to the post",
      application,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to apply to provider post");
    return res.status(status).json(body);
  }
}

// Controller to apply for a seeker post
export async function applySeekerPostController(req: Request, res: Response) {
  try {
    const { seekerPostId, message } = req.body;
    const applicantId = (req as any).user.id;
    if (!applicantId || !seekerPostId) {
      return res
        .status(400)
        .json({ success: false, message: "applicantId and seekerPostId are required" });
    }

    const application = await applyToSeekerPost(
      applicantId,
      seekerPostId,
      message
    );
    logAudit(req, {
      action: "APPLIED_SEEKER_POST",
      category: "USER_ACTIVITY",
      targetId: application.id,
      targetType: "Application",
      description: `Applied to seeker post ${seekerPostId}`,
      metadata: { seekerPostId },
    });
    return res.status(201).json({
      success: true,
      message: "successfully applied to the post",
      application,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to apply to seeker post");
    return res.status(status).json(body);
  }
}



export const updateStatusController = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const status = req.body.status;
    const userId = (req as any).user.id;
    const updated = await updateApplicationStatus(id, userId, status);
    logAudit(req, {
      action: "APPLICATION_STATUS_UPDATED",
      category: "USER_ACTIVITY",
      targetId: id,
      targetType: "Application",
      description: `Updated application ${id} status to ${status}`,
      metadata: { newStatus: status },
    });
    res.json({ success: true, data: updated });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to update status");
    return res.status(status).json(body);
  }
};

export const getApplicationDetailsController = async (
  req: Request,
  res: Response
) => {
  try {
    const id = req.params.id;
    const app = await getApplicationById(id);
    if (!app)
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    res.json({ success: true, data: app });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to fetch application details");
    return res.status(status).json(body);
  }
};

export async function getProviderReceivedApplicationsController(
  req: Request,
  res: Response,
  next: any
) {
  try {
    const userId = (req as any).user.id;
    const data = await getProviderReceivedApplications(userId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getProviderAppliedApplicationsController(
  req: Request,
  res: Response,
  next: any
) {
  try {
    const userId = (req as any).user.id;
    const data = await getProviderAppliedApplications(userId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getSeekerReceivedApplicationsController(
  req: Request,
  res: Response,
  next: any
) {
  try {
    const userId = (req as any).user.id;
    const data = await getSeekerReceivedApplications(userId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getSeekerAppliedApplicationsController(
  req: Request,
  res: Response,
  next: any
) {
  try {
    const userId = (req as any).user.id;
    const data = await getSeekerAppliedApplications(userId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
