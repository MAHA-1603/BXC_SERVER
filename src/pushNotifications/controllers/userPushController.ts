import { Request, Response } from 'express';
import { Platform } from '../types';
import * as pushService from '../services/pushService';

/**
 * Register a device token for push notifications
 * POST /api/push/device-token
 */
export const registerToken = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { token, platform, deviceId } = req.body;

    if (!token || !platform) {
      return res.status(400).json({
        success: false,
        message: 'Token and platform are required',
      });
    }

    // Validate platform
    const validPlatforms: Platform[] = ['ANDROID', 'IOS', 'WEB'];
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid platform. Must be ANDROID, IOS, or WEB',
      });
    }

    const deviceToken = await pushService.registerDeviceToken(
      userId,
      token,
      platform,
      deviceId
    );

    return res.status(200).json({
      success: true,
      message: 'Device token registered successfully',
      data: {
        id: deviceToken.id,
        platform: deviceToken.platform,
      },
    });
  } catch (error) {
    console.error('Error registering device token:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to register device token',
    });
  }
};

/**
 * Remove a specific device token
 * DELETE /api/push/device-token
 */
export const removeToken = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required',
      });
    }

    await pushService.removeDeviceToken(userId, token);

    return res.status(200).json({
      success: true,
      message: 'Device token removed successfully',
    });
  } catch (error) {
    console.error('Error removing device token:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove device token',
    });
  }
};

/**
 * Remove all device tokens for a user (logout from all devices)
 * DELETE /api/push/device-tokens
 */
export const removeAllTokens = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const result = await pushService.removeAllUserTokens(userId);

    return res.status(200).json({
      success: true,
      message: 'All device tokens removed successfully',
      data: { count: result.count },
    });
  } catch (error) {
    console.error('Error removing all device tokens:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove device tokens',
    });
  }
};

/**
 * Get all device tokens for the current user
 * GET /api/push/device-tokens
 */
export const getMyTokens = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const tokens = await pushService.getUserTokens(userId);

    return res.status(200).json({
      success: true,
      data: tokens.map((t) => ({
        id: t.id,
        token: t.token, // Added for testing - consider removing in production
        platform: t.platform,
        deviceId: t.deviceId,
        lastUsedAt: t.lastUsedAt,
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error getting device tokens:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get device tokens',
    });
  }
};

/**
 * Send a test push notification to the current user
 * POST /api/push/test
 */
export const sendTestPush = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const result = await pushService.sendPushToUser(
      userId,
      'Test Notification',
      'This is a test push notification from BenchXchange!',
      { type: 'test' }
    );

    return res.status(200).json({
      success: true,
      message: 'Test notification sent',
      data: result,
    });
  } catch (error) {
    console.error('Error sending test push:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send test notification',
    });
  }
};

/**
 * Check if user has registered push tokens
 * GET /api/push/check?platform=ANDROID
 */
export const checkTokenStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { platform } = req.query;

    // Validate platform if provided
    const validPlatforms: Platform[] = ['ANDROID', 'IOS', 'WEB'];
    if (platform && !validPlatforms.includes(platform as Platform)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid platform. Must be ANDROID, IOS, or WEB',
      });
    }

    const status = await pushService.checkUserTokenStatus(
      userId,
      platform as Platform | undefined
    );

    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Error checking token status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check token status',
    });
  }
};

/**
 * Replace token by platform/device - removes old tokens and registers new one
 * PUT /api/push/device-token
 */
export const replaceToken = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { token, platform, deviceId } = req.body;

    if (!token || !platform) {
      return res.status(400).json({
        success: false,
        message: 'Token and platform are required',
      });
    }

    // Validate platform
    const validPlatforms: Platform[] = ['ANDROID', 'IOS', 'WEB'];
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid platform. Must be ANDROID, IOS, or WEB',
      });
    }

    const deviceToken = await pushService.replaceTokenByPlatformOrDevice(
      userId,
      token,
      platform,
      deviceId
    );

    return res.status(200).json({
      success: true,
      message: 'Device token replaced successfully',
      data: {
        id: deviceToken.id,
        platform: deviceToken.platform,
        deviceId: deviceToken.deviceId,
      },
    });
  } catch (error) {
    console.error('Error replacing device token:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to replace device token',
    });
  }
};
