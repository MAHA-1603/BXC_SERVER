import { Request, Response } from "express";
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllAsRead,
  createNotification,
  deleteAllNotifications,
  deleteNotificationById,
} from "../../services/notification/userNotificationService";
import { handleError } from "../../utils/errorHandler";
import { logAudit } from "../../utils/auditHelper";

export const getNotifications = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const notifications = await getUserNotifications(userId);
    res.json({
        message: "All Notifications fetched successfully",
        notifications :notifications});
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to fetch notifications");
    res.status(status).json(body);
  }
};

export const markAsRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const notification = await markNotificationAsRead(id);
    res.json(notification);
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to mark as read");
    res.status(status).json(body);
  }
};

export const markAllRead = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    await markAllAsRead(userId);
    res.json({ message: "All notifications marked as read" });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to mark all as read");
    res.status(status).json(body);
  }
};

export const sendNotification = async (req: Request, res: Response) => {
  try {
    const { userId, title, message, type } = req.body;
    const notification = await createNotification(userId, title, message, type);
    logAudit(req, {
      action: "NOTIFICATION_CREATED",
      category: "NOTIFICATION",
      targetId: notification.id,
      targetType: "Notification",
      description: `User created notification: ${title}`,
    });
    res.status(201).json(notification);
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to create notification");
    res.status(status).json(body);
  }
};



// Delete a specific notification
export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    const result = await deleteNotificationById(id, userId);
    if (result.count === 0) {
      return res.status(404).json({ error: "Notification not found or already deleted" });
    }

    logAudit(req, {
      action: "NOTIFICATION_DELETED",
      category: "NOTIFICATION",
      targetId: id,
      targetType: "Notification",
      description: `User deleted notification ${id}`,
    });
    res.json({ message: "Notification deleted successfully" });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to delete notification");
    res.status(status).json(body);
  }
};

// Delete all notifications for a user
export const deleteAllUserNotifications = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    await deleteAllNotifications(userId);
    logAudit(req, {
      action: "NOTIFICATION_DELETED_ALL",
      category: "NOTIFICATION",
      targetType: "Notification",
      description: "User deleted all notifications",
    });
    res.json({ message: "All notifications deleted successfully" });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to delete all notifications");
    res.status(status).json(body);
  }
};
