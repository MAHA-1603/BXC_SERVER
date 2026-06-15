import { PrismaClient } from "@prisma/client";
import { sendPushToAll } from "../../pushNotifications/services/pushService";

const prisma = new PrismaClient();

/**
 * Send notification to all users (broadcast)
 * Also sends push notification to all registered devices
 */
export const sendNotificationToAllUsers = async (
  adminId: string,
  title: string,
  message: string,
  type?: string
) => {
  // Create one notification broadcast record
  const result = await prisma.notification.create({
    data: {
      title,
      message,
      type,
      createdById: adminId,    // Admin who created the notification
      creatorType: "ADMIN",    // Mark creator type as ADMIN
      // userId not set, meaning broadcast (applies to all users)
    },
  });

  // Send push notification to all users (fire-and-forget)
  sendPushToAll(title, message, { 
    type: type || 'broadcast',
    notificationId: result.id 
  }).catch((err) => {
    console.error('Broadcast push notification failed:', err);
  });

  return result;  // returns created notification object
};


// Get notifications created by current admin
export const getAdminCreatedNotifications = async (adminId: string) => {
  return prisma.notification.findMany({
    where: { createdById: adminId, creatorType: "ADMIN" },
    orderBy: { createdAt: "desc" },
  });
};

// Get all notifications created by any admin
export const getAllAdminNotifications = async () => {
  return prisma.notification.findMany({
    where: { creatorType: "ADMIN" },
    orderBy: { createdAt: "desc" },
  });
};

// Edit any notification
export const adminEditNotification = async (
  notificationId: string,
  updateData: { title?: string; message?: string; type?: string }
) => {
  return prisma.notification.update({
    where: { id: notificationId },
    data: updateData,
  });
};

// Delete any notification entirely
export const adminDeleteNotification = async (notificationId: string) => {
  return prisma.notification.delete({
    where: { id: notificationId },
  });
};

export const adminDeleteAllAdminNotifications = async () => {
  return prisma.notification.deleteMany({
    where: { creatorType: "ADMIN" }
  });
};





