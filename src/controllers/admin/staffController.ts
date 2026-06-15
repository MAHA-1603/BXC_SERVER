import { Request, Response } from "express";
import * as staffService from "../../services/admin/staffService";
import { handleError } from "../../utils/errorHandler";

export const createStaff = async (req: Request, res: Response) => {
  try {
    const { fullName, email, password, adminRole, permissions } = req.body;

    if (!fullName || !email || !password || !adminRole) {
      return res.status(400).json({ success: false, message: "Missing required fields (fullName, email, password, adminRole)" });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters long" });
    }

    const newStaff = await staffService.createStaffMember({
      fullName,
      email,
      password,
      adminRole,
      permissions: permissions || [],
    });

    res.status(201).json({ success: true, data: newStaff, message: "Staff created successfully." });
  } catch (error: any) {
    if (error.message === "Staff member with this email already exists") {
      return res.status(409).json({ success: false, message: error.message });
    }
    const { status, body } = handleError.full(error, "Failed to create staff member");
    return res.status(status).json(body);
  }
};

export const getStaffList = async (req: Request, res: Response) => {
  try {
    const staffMembers = await staffService.getAllStaffMembers();
    return res.status(200).json({ success: true, data: staffMembers });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to get staff list");
    return res.status(status).json(body);
  }
};

export const updateStaff = async (req: Request, res: Response) => {
  try {
    const staffId = req.params.staffId;
    const { adminRole, permissions } = req.body;

    const updatedStaff = await staffService.updateStaffMember(staffId, {
      adminRole,
      permissions,
    });

    return res.status(200).json({ success: true, data: updatedStaff, message: "Staff updated successfully." });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to update staff member");
    return res.status(status).json(body);
  }
};

export const deleteStaff = async (req: Request, res: Response) => {
  try {
    const staffId = req.params.staffId;

    // Optional: add a check to prevent super admins from deleting themselves
    const requestingAdminId = (req as any).user.id;
    if (staffId === requestingAdminId) {
      return res.status(400).json({ success: false, message: "Cannot delete your own account." });
    }

    await staffService.deleteStaffMember(staffId);

    return res.status(200).json({ success: true, message: "Staff member deleted successfully." });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to delete staff member");
    return res.status(status).json(body);
  }
};
