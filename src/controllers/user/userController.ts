import {
  getAddOnSummary,
  getMyProfileService,
  updateProfileService,
} from "../../services/user/userServices";
import * as addonService from "../../services/admin/addonService";
import { Request, Response } from "express";
import { handleError } from "../../utils/errorHandler";
import { logAudit } from "../../utils/auditHelper";

export async function getAllAddons(req: Request, res: Response) {
  try {
    const addons = await addonService.getAddons();
    res.json({ success: true, data: addons });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to fetch addons");
    res.status(status).json(body);
  }
}

import { decryptDocumentUrl } from "../../utils/cryptoUtils";

export const getMyProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id; // from JWT middleware
    const user = await getMyProfileService(userId);

    if (user?.status === "APPROVED") {
      user.rejectionReason = "";
    }

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const documentFields = ["panDocumentUrl", "cinDocumentUrl", "gstDocumentUrl"];
    for (const field of documentFields) {
      if (user[field as keyof typeof user]) {
        (user as any)[field] = await decryptDocumentUrl(user[field as keyof typeof user] as string);
      }
    }

    res.json({
      success: true,
      message: "My profile fetched successfully",
      data: user,
    });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to fetch profile");
    res.status(status).json(body);
  }
};

export async function getUserAddOnSummary(req: Request, res: Response) {
  try {
    const userId = (req as any).user.id; // assuming user id is set in req.user by auth middleware

    const summary = await getAddOnSummary(userId);

    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to fetch addon summary");
    res.status(status).json(body);
  }
}

export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const user = await getMyProfileService(userId);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const documentFields = ["panDocumentUrl", "cinDocumentUrl", "gstDocumentUrl"];
    const reqUser = (req as any).user;
    for (const field of documentFields) {
      if (reqUser && (reqUser.role === "ADMIN" || reqUser.id === user.id)) {
        if (user[field as keyof typeof user]) {
          (user as any)[field] = await decryptDocumentUrl(user[field as keyof typeof user] as string);
        }
      } else {
        // Not admin or owner, don't return the URL at all (or leave it encrypted, but null is safer)
        (user as any)[field] = null;
      }
    }

    res.json({
      success: true,
      message: "User profile fetched successfully",
      data: user,
    });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to fetch user profile");
    res.status(status).json(body);
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id; // or req.user.id
    const updateData = req.body;

    const updatedUser = await updateProfileService(userId, updateData);

    const documentFields = ["panDocumentUrl", "cinDocumentUrl", "gstDocumentUrl"];
    for (const field of documentFields) {
      if (updatedUser[field as keyof typeof updatedUser]) {
        (updatedUser as any)[field] = await decryptDocumentUrl(updatedUser[field as keyof typeof updatedUser] as string);
      }
    }

    logAudit(req, {
      action: "PROFILE_UPDATED",
      category: "USER_ACTIVITY",
      targetId: userId,
      targetType: "User",
      description: `User updated their profile`,
      metadata: { updatedFields: Object.keys(updateData) },
    });

    res.json({ success: true, data: updatedUser });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to update profile");
    res.status(status).json(body);
  }
};
