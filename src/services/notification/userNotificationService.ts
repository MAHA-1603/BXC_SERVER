import { PrismaClient } from "@prisma/client";
import { sendPushToUser } from "../../pushNotifications/services/pushService";

const prisma = new PrismaClient();

export const getUserNotifications = async (userId: string) => {
  // User notifications where userId equals userId and not deleted
  const userNotifications = await prisma.notification.findMany({
    where: {
      userId: userId,
      isDeleted: false,
    },
  });

  // Admin broadcast notifications where userId is null and creatorType is ADMIN
  const adminNotifications = await prisma.notification.findMany({
    where: {
      creatorType: "ADMIN",
      isDeleted: false,
    },
  });

 

  // Combine and sort by createdAt descending
  const merged = [...userNotifications, ...adminNotifications].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  return merged;
};



export const markNotificationAsRead = async (id: string) => {
  return prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });
};

export const markAllAsRead = async (userId: string) => {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
};

/**
 * Create a notification and automatically send push notification
 * Push is sent fire-and-forget (non-blocking)
 */
export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type?: string,
  navigationData?: Record<string, string>
) => {
  // Create in-app notification
  const notification = await prisma.notification.create({
    data: { userId, title, message, type, navigationData },
  });

  // Send push notification (fire-and-forget - don't wait for response)
  sendPushToUser(userId, title, message, { 
    type: type || 'notification',
    notificationId: notification.id,
    ...(navigationData || {})  // Spread navigation data into push payload
  }).catch((err) => {
    console.error('Push notification failed:', err);
  });

  return notification;
};




// Soft delete one specific notification for the user
export const deleteNotificationById = async (id: string, userId: string) => {
  return prisma.notification.updateMany({
    where: { id, userId },
    data: { isDeleted: true },
  });
};

// Soft delete all notifications for a user
export const deleteAllNotifications = async (userId: string) => {
  return prisma.notification.updateMany({
    where: { userId },
    data: { isDeleted: true },
  });
};