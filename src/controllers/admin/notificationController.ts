import { Request, Response } from "express";
import { handleError } from "../../utils/errorHandler";
import { logAudit } from "../../utils/auditHelper";

import {
  getAdminCreatedNotifications,
  getAllAdminNotifications,
  adminEditNotification,
  adminDeleteNotification,
  sendNotificationToAllUsers,
  adminDeleteAllAdminNotifications,
} from "../../services/admin/notificationService";

// Get notifications created by current admin
export const getMyCreatedNotifications = async (
  req: Request,
  res: Response
) => {
  try {
    const adminId = (req as any).user.id;
    const notifications = await getAdminCreatedNotifications(adminId);
    if (notifications.length === 0) {
      return res
        .status(200)
        .json({ message: "No notifications found." });
    }
    return res.status(200).json({message : "Fetched Notifications Successfully",notifications});
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to fetch notifications");
    return res.status(status).json(body);
  }
};

// Get all notifications created by any admin
export const getAllNotifications = async (req: Request, res: Response) => {
  try {
    const notifications = await getAllAdminNotifications();
    if (notifications.length === 0) {
      return res
        .status(200)
        .json({ message: "No notifications found."});
    }
    return res.status(200).json({message : "Fetched Notifications Successfully",notifications});
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to fetch notifications");
    return res.status(status).json(body);
  }
};

// Edit a notification (any admin)
export const editNotification = async (req: Request, res: Response) => {
  try {
    const notificationId = req.params.id;
    const updateData = req.body;
    const updated = await adminEditNotification(notificationId, updateData);
    logAudit(req, {
      action: "NOTIFICATION_UPDATED",
      category: "NOTIFICATION",
      targetId: notificationId,
      targetType: "Notification",
      description: `Updated notification ${notificationId}`,
    });
    res.json(updated);
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to edit notification");
    res.status(status).json(body);
  }
};

// Delete a notification (any admin)
export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const notificationId = req.params.id;
    await adminDeleteNotification(notificationId);
    logAudit(req, {
      action: "NOTIFICATION_DELETED",
      category: "NOTIFICATION",
      targetId: notificationId,
      targetType: "Notification",
      description: `Deleted notification ${notificationId}`,
    });
    res.json({ message: "Notification deleted successfully" });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to delete notification");
    res.status(status).json(body);
  }
};

export const notifyAllUsers = async (req: Request, res: Response) => {
  try {
    const { title, message, type } = req.body;
    const adminId = (req as any).user.id;
    if (!adminId) {
      return res.status(403).json({ error: "Unauthorized" });
    }
    // Optional: Verify admin role in middleware or here

    const result = await sendNotificationToAllUsers(
      adminId,
      title,
      message,
      type
    );
    logAudit(req, {
      action: "NOTIFICATION_SENT_ALL",
      category: "NOTIFICATION",
      targetType: "Notification",
      description: `Sent notification to all users: ${title}`,
      metadata: { title, type },
    });
    res.json({ message: "Notification sent to all users", result });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to send notification to all users.");
    res.status(status).json(body);
  }
};

// Delete all admin-created notifications only
export const deleteAllAdminNotifications = async (
  req: Request,
  res: Response
) => {
  try {
    await adminDeleteAllAdminNotifications();
    logAudit(req, {
      action: "NOTIFICATION_DELETED_ALL",
      category: "NOTIFICATION",
      targetType: "Notification",
      description: "Deleted all admin-created notifications",
    });
    res.json({ message: "All admin notifications deleted successfully." });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to delete notifications");
    res.status(status).json(body);
  }
};
