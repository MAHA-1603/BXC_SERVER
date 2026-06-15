import { Request, Response } from "express";
import * as adminService from "../../services/admin/adminService";
import { UserStatus } from "@prisma/client";
import { sendEmail } from "../../utils/email";
import { prisma } from "../../config/database";
import { handleError } from "../../utils/errorHandler";
import { logAudit } from "../../utils/auditHelper";
import { decryptUserDocuments } from "../../utils/cryptoUtils";

// Fetch all users with PENDING status
export const getPendingUsers = async (req: Request, res: Response) => {
  try {
    const users = await adminService.getPendingUsers();
    res.json(await Promise.all(users.map(decryptUserDocuments)));
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to fetch pending users");
    res.status(status).json(body);
  }
};

// get all the users in the system
// export const getAllUsers = async (req: Request, res: Response) => {
//   try{
//     const users = await adminService.getAllUsers();
//     return res.status(200).json(users);
//   } catch (error){
//     return res.status(500).json({ message: "Failed to fetch users" , error: error});
//   }
// };

export const getAllUsersController = async (req: Request, res: Response) => {
  try {
    const users = await adminService.getAllUsers();
    
    // Decrypt URLs for all user lists
    users.allUsers = await Promise.all(users.allUsers.map(decryptUserDocuments));
    users.approvedUsers = await Promise.all(users.approvedUsers.map(decryptUserDocuments));
    users.rejectedUsers = await Promise.all(users.rejectedUsers.map(decryptUserDocuments));

    return res.status(200).json({
      success: true,
      message: "Users fetched successfully",
      users,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Something went wrong");
    return res.status(status).json(body);
  }
};

// Approve a user and send approval email
export const approveUser = async (req: Request, res: Response) => {
  const { userId } = req.params;
  try {
    const updatedUser = await adminService.updateUserStatus(
      userId,
      UserStatus.APPROVED
    );

    // Send approval email
    await sendEmail(
      updatedUser.email,
      "Your BenchXchange Account is Approved ✅",
      `Hi ${updatedUser.fullName},\n\nYour account has been approved by the admin. You can now log in and start using BenchXchange from here: ${process.env.FRONTEND_URL} .\n\n- BenchXchange Team`
    );

    logAudit(req, {
      action: "USER_APPROVED",
      category: "USER_MANAGEMENT",
      targetId: userId,
      targetType: "User",
      description: `Approved user ${updatedUser.fullName} (${updatedUser.email})`,
    });

    res.json(updatedUser);
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to approve user");
    res.status(status).json(body);
  }
};

// Reject a user with reason and send rejection email
export const rejectUser = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { reason } = req.body; // 👈 rejection reason from request

  try {
    if (!reason) {
      return res.status(400).json({ message: "Rejection reason is required" });
    }

    // 1️⃣ Get user first
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2️⃣ Prevent rejection if already approved
    if (existingUser.status === UserStatus.APPROVED) {
      return res.status(400).json({
        message: "User is already approved and cannot be rejected",
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.REJECTED,
        rejectionReason: reason, // save rejection reason in DB
      },
    });

    // Send rejection email with reason
    await sendEmail(
      updatedUser.email,
      "Your BenchXchange Account is Rejected ❌",
      `Hi ${updatedUser.fullName},

We are sorry to inform you that your account has been rejected by the admin.

Reason: ${reason}

You may re-apply with correct details here: ${process.env.FRONTEND_URL}/reapply

- BenchXchange Team`
    );

    // await sendEmail(
    //   updatedUser.email,
    //   "Your BenchXchange Account is Rejected ❌",
    //   `Hi ${updatedUser.fullName},\n\nWe are sorry to inform you that your account has been rejected by the admin.\n\nReason: ${reason}\n\nYou may re-apply with correct details.\n\n- BenchXchange Team`
    // );

    logAudit(req, {
      action: "USER_REJECTED",
      category: "USER_MANAGEMENT",
      targetId: userId,
      targetType: "User",
      description: `Rejected user ${updatedUser.fullName} (${updatedUser.email})`,
      metadata: { reason },
    });

    res.json({
      message: "User rejected successfully",
      user: updatedUser,
      reason: reason,
    });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to reject user");
    res.status(status).json(body);
  }
};

export const createAdmin = async (req: Request, res: Response) => {
  try {
    const admin = await adminService.createAdmin(req.body);
    logAudit(req, {
      action: "ADMIN_CREATED",
      category: "STAFF",
      targetId: admin.id,
      targetType: "Admin",
      description: `Created new admin: ${admin.fullName} (${admin.email})`,
      actor: admin,
    });
    res.status(201).json({ message: "Admin created", admin });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to create admin");
    res.status(status).json(body);
  }
};

// Get user by email (for admin lookup)
export const getUserByEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.query;

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        success: false,
        message: "Email query parameter is required",
      });
    }

    const user = await adminService.getUserByEmail(email);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found with this email",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User fetched successfully",
      data: await decryptUserDocuments(user),
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to fetch user");
    return res.status(status).json(body);
  }
};

// Get user by ID (for admin)
export const getUserById = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const user = await adminService.getUserById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User fetched successfully",
      data: await decryptUserDocuments(user),
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to fetch user");
    return res.status(status).json(body);
  }
};

// Admin update user - full access to all fields
export const updateUserByAdmin = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const updateData = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const updatedUser = await adminService.adminUpdateUser(userId, updateData);

    logAudit(req, {
      action: "USER_UPDATED",
      category: "USER_MANAGEMENT",
      targetId: userId,
      targetType: "User",
      description: `Updated user ${updatedUser.fullName}`,
      metadata: { updatedFields: Object.keys(updateData) },
    });

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: await decryptUserDocuments(updatedUser),
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to update user");
    return res.status(status).json(body);
  }
};

// Suspend user for malicious activities
export const suspendUserController = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Suspension reason is required",
      });
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (existingUser.status === "SUSPENDED") {
      return res.status(400).json({
        success: false,
        message: "User is already suspended",
      });
    }

    const suspendedUser = await adminService.suspendUser(userId, reason);

    // Send suspension email
    await sendEmail(
      suspendedUser.email,
      "Your BenchXchange Account is Suspended ⚠️",
      `Hi ${suspendedUser.fullName},

Your account has been suspended due to policy violations.

Reason: ${reason}

If you believe this is a mistake, please contact our support team.

- BenchXchange Team`
    );

    logAudit(req, {
      action: "USER_SUSPENDED",
      category: "USER_MANAGEMENT",
      targetId: userId,
      targetType: "User",
      description: `Suspended user ${suspendedUser.fullName} (${suspendedUser.email})`,
      metadata: { reason },
    });

    return res.status(200).json({
      success: true,
      message: "User suspended successfully",
      data: suspendedUser,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to suspend user");
    return res.status(status).json(body);
  }
};

// Get all providers (jobs) with filtering, search and pagination
export const getProviders = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const search = req.query.search as string;

    const result = await adminService.getProviderPosts(page, limit, status, search);

    return res.status(200).json({
      success: true,
      message: "Provider jobs fetched successfully",
      ...result,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to fetch provider jobs");
    return res.status(status).json(body);
  }
};

// Get all seekers (jobs) with filtering, search and pagination
export const getSeekers = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const search = req.query.search as string;

    const result = await adminService.getSeekerPosts(page, limit, status, search);

    return res.status(200).json({
      success: true,
      message: "Seeker jobs fetched successfully",
      ...result,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to fetch seeker jobs");
    return res.status(status).json(body);
  }
};

// Unsuspend user - remove suspension
export const unsuspendUserController = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Check if user exists and is suspended
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (existingUser.status !== "SUSPENDED") {
      return res.status(400).json({
        success: false,
        message: "User is not suspended",
      });
    }

    const unsuspendedUser = await adminService.unsuspendUser(userId);

    // Send unsuspension email
    await sendEmail(
      unsuspendedUser.email,
      "Your BenchXchange Account Suspension Removed ✅",
      `Hi ${unsuspendedUser.fullName},

Good news! The suspension on your account has been lifted.

You can now log in and use BenchXchange normally: ${process.env.FRONTEND_URL}

- BenchXchange Team`
    );

    logAudit(req, {
      action: "USER_UNSUSPENDED",
      category: "USER_MANAGEMENT",
      targetId: userId,
      targetType: "User",
      description: `Unsuspended user ${unsuspendedUser.fullName} (${unsuspendedUser.email})`,
    });

    return res.status(200).json({
      success: true,
      message: "User suspension removed successfully",
      data: unsuspendedUser,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to unsuspend user");
    return res.status(status).json(body);
  }
};

// Get user's post statistics (for admin)
export const getUserPostStatsController = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const stats = await adminService.getUserPostStats(userId);

    return res.status(200).json({
      success: true,
      message: "User post statistics fetched successfully",
      data: stats,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to fetch user post statistics");
    return res.status(status).json(body);
  }
};

