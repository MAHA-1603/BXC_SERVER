import { Request, Response } from 'express';
import * as pushService from '../services/pushService';

/**
 * Send push notification to specific users
 * POST /api/admin/push/send
 */
export const sendPushToUsers = async (req: Request, res: Response) => {
  try {
    const { userIds, title, body, data } = req.body;

    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: 'Title and body are required',
      });
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'userIds must be a non-empty array',
      });
    }

    const result = await pushService.sendPushToMultipleUsers(
      userIds,
      title,
      body,
      data
    );

    return res.status(200).json({
      success: true,
      message: 'Push notifications sent',
      data: {
        targetedUsers: userIds.length,
        devicesSent: result.sent,
        expoSuccess: result.expo,
        fcmSuccess: result.fcm,
      },
    });
  } catch (error) {
    console.error('Error sending push to users:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send push notifications',
    });
  }
};

/**
 * Broadcast push notification to all users
 * POST /api/admin/push/broadcast
 */
export const broadcastPush = async (req: Request, res: Response) => {
  try {
    const { title, body, data } = req.body;

    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: 'Title and body are required',
      });
    }

    const result = await pushService.sendPushToAll(title, body, data);

    return res.status(200).json({
      success: true,
      message: 'Broadcast push notification sent',
      data: {
        totalDevices: result.sent,
        expoSuccess: result.expo,
        fcmSuccess: result.fcm,
      },
    });
  } catch (error) {
    console.error('Error broadcasting push:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to broadcast push notification',
    });
  }
};

/**
 * Send push notification to a single user
 * POST /api/admin/push/user/:userId
 */
export const sendPushToSingleUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { title, body, data } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }

    if (!title || !body) {
      return res.status(400).json({
        success: false,
        message: 'Title and body are required',
      });
    }

    const result = await pushService.sendPushToUser(userId, title, body, data);

    return res.status(200).json({
      success: true,
      message: 'Push notification sent to user',
      data: {
        userId,
        devicesSent: result.sent,
        expoSuccess: result.expo,
        fcmSuccess: result.fcm,
      },
    });
  } catch (error) {
    console.error('Error sending push to user:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send push notification',
    });
  }
};
