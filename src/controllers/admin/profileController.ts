import { Request, Response } from "express";
import { handleError } from "../../utils/errorHandler";
import {
  getAdminProfile,
  updateAdminProfile,
} from "../../services/admin/profileService";
import { logAudit } from "../../utils/auditHelper";

// Get admin profile
export const getProfile = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).user.id; // comes from auth middleware
    const admin = await getAdminProfile(adminId);
    res.json({ success: true, data: admin });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to fetch profile");
    res.status(status).json(body);
  }
};

// Update admin profile
export const updateProfile = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).user.id; // or req.params.id if you want
    const updateData = req.body;

    const updatedAdmin = await updateAdminProfile(adminId, updateData);
    logAudit(req, {
      action: "ADMIN_PROFILE_UPDATED",
      category: "USER_ACTIVITY",
      targetId: adminId,
      targetType: "Admin",
      description: "Admin updated their profile",
      metadata: { updatedFields: Object.keys(updateData) },
    });
    res.json({ success: true, data: updatedAdmin });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to update profile");
    res.status(status).json(body);
  }
};
