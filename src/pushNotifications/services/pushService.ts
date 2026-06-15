import { PrismaClient } from '@prisma/client';
import admin from '../../config/firebase';
import { EXPO_PUSH_URL, getExpoHeaders } from '../../config/expo';
import {
  Platform,
  DeviceToken,
  PushNotificationPayload,
  ExpoPushMessage,
  ExpoPushTicket,
} from '../types';

const prisma = new PrismaClient();

/**
 * Register a device token for push notifications
 */
export const registerDeviceToken = async (
  userId: string,
  token: string,
  platform: Platform,
  deviceId?: string
) => {
  // 1. Deactivate this token for any other user (prevents cross-user notifications)
  await prisma.deviceToken.updateMany({
    where: {
      token,
      userId: { not: userId },
      isActive: true,
    },
    data: { isActive: false },
  });

  if (deviceId) {
    // 2. Ensure only one active token per physical deviceId (prevents duplicates on same device)
    await prisma.deviceToken.updateMany({
      where: {
        deviceId,
        token: { not: token },
        isActive: true,
      },
      data: { isActive: false },
    });
  }

  // 3. Upsert token - update if same user+token exists, create otherwise
  return prisma.deviceToken.upsert({
    where: {
      userId_token: {
        userId,
        token,
      },
    },
    update: {
      platform,
      deviceId,
      isActive: true,
      lastUsedAt: new Date(),
    },
    create: {
      userId,
      token,
      platform,
      deviceId,
      isActive: true,
    },
  });
};

/**
 * Remove a specific device token
 */
export const removeDeviceToken = async (userId: string, token: string) => {
  return prisma.deviceToken.deleteMany({
    where: {
      userId,
      token,
    },
  });
};

/**
 * Remove all device tokens for a user (logout from all devices)
 */
export const removeAllUserTokens = async (userId: string) => {
  return prisma.deviceToken.deleteMany({
    where: {
      userId,
    },
  });
};

/**
 * Get all active tokens for a user
 */
export const getUserTokens = async (userId: string) => {
  return prisma.deviceToken.findMany({
    where: {
      userId,
      isActive: true,
    },
  });
};

/**
 * Get all active tokens for multiple users
 */
export const getMultipleUsersTokens = async (userIds: string[]) => {
  return prisma.deviceToken.findMany({
    where: {
      userId: { in: userIds },
      isActive: true,
    },
  });
};

/**
 * Get all active tokens (for broadcast)
 */
export const getAllActiveTokens = async () => {
  return prisma.deviceToken.findMany({
    where: {
      isActive: true,
    },
  });
};

/**
 * Mark token as inactive (when push fails with invalid token)
 */
export const deactivateToken = async (token: string) => {
  return prisma.deviceToken.updateMany({
    where: { token },
    data: { isActive: false },
  });
};

/**
 * Check if user has registered token(s), optionally filter by platform
 */
export const checkUserTokenStatus = async (
  userId: string,
  platform?: Platform
) => {
  const where: { userId: string; isActive: boolean; platform?: Platform } = {
    userId,
    isActive: true,
  };
  
  if (platform) {
    where.platform = platform;
  }

  const tokens = await prisma.deviceToken.findMany({
    where,
    select: {
      id: true,
      platform: true,
      deviceId: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { lastUsedAt: 'desc' },
  });

  const platforms = [...new Set(tokens.map(t => t.platform))];

  return {
    hasToken: tokens.length > 0,
    tokenCount: tokens.length,
    platforms,
    tokens,
  };
};

/**
 * Replace token by platform or device - removes old tokens and registers new one
 * If deviceId is provided, only removes tokens for that device
 * If only platform is provided, removes ALL tokens for that platform
 */
export const replaceTokenByPlatformOrDevice = async (
  userId: string,
  newToken: string,
  platform: Platform,
  deviceId?: string
) => {
  // 1. Deactivate this new token for any other user to prevent duplicates/leaks
  await prisma.deviceToken.updateMany({
    where: {
      token: newToken,
      userId: { not: userId },
      isActive: true,
    },
    data: { isActive: false },
  });

  // Build delete condition
  const deleteWhere: { userId: string; platform: Platform; deviceId?: string; token?: string } = {
    userId,
    platform,
  };
  
  if (deviceId) {
    deleteWhere.deviceId = deviceId;
  } else {
    // If deviceId is not provided, only remove the exact matching token 
    // to prevent logging out other active devices of the same platform.
    deleteWhere.token = newToken;
  }

  // Delete old tokens matching this condition
  await prisma.deviceToken.deleteMany({
    where: deleteWhere,
  });

  // Register or reactivate new token using upsert to avoid duplicate records
  return prisma.deviceToken.upsert({
    where: {
      userId_token: {
        userId,
        token: newToken,
      },
    },
    update: {
      platform,
      deviceId,
      isActive: true,
      lastUsedAt: new Date(),
    },
    create: {
      userId,
      token: newToken,
      platform,
      deviceId,
      isActive: true,
    },
  });
};

/**
 * Send push notification via Expo (for Android/iOS)
 */
export const sendExpoNotification = async (
  tokens: string[],
  payload: PushNotificationPayload
): Promise<ExpoPushTicket[]> => {
  if (tokens.length === 0) return [];

  // Deduplicate tokens to prevent sending duplicate notifications to the same device
  const uniqueTokens = [...new Set(tokens)];

  const messages: ExpoPushMessage[] = uniqueTokens.map((token) => ({
    to: token,
    title: payload.title,
    body: payload.body,
    data: payload.data,
    sound: 'default',
    priority: 'high',
  }));

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: getExpoHeaders(),
      body: JSON.stringify(messages),
    });

    const result = await response.json() as { data: ExpoPushTicket[] };
    
    // Handle invalid tokens
    if (result.data) {
      for (let i = 0; i < result.data.length; i++) {
        const ticket = result.data[i];
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          // Token is invalid, deactivate it
          await deactivateToken(uniqueTokens[i]);
        }
      }
    }

    return result.data || [];
  } catch (error) {
    console.error('Expo push notification error:', error);
    return [];
  }
};

/**
 * Send push notification via FCM (for Web)
 */
export const sendFCMNotification = async (
  tokens: string[],
  payload: PushNotificationPayload
): Promise<{ success: number; failure: number }> => {
  if (tokens.length === 0 || !admin.apps.length) {
    return { success: 0, failure: 0 };
  }

  // Deduplicate tokens to prevent sending duplicate notifications to the same device
  const uniqueTokens = [...new Set(tokens)];

  let success = 0;
  let failure = 0;

  // Send to each token individually (FCM v1 API doesn't support batch with different tokens)
  for (const token of uniqueTokens) {
    try {
      await admin.messaging().send({
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data,
        webpush: {
          notification: {
            icon: '/icon.png',
          },
        },
      });
      success++;
    } catch (error: any) {
      failure++;
      // If token is invalid, deactivate it
      if (
        error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered'
      ) {
        await deactivateToken(token);
      }
      console.error(`FCM send error for token ${token.substring(0, 20)}...`, error.message);
    }
  }

  return { success, failure };
};

/**
 * Send push notification to a specific user (all their devices)
 */
export const sendPushToUser = async (
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
) => {
  const tokens = await getUserTokens(userId);
  
  if (tokens.length === 0) {
    return { sent: 0, expo: 0, fcm: 0 };
  }

  const expoTokens = tokens
    .filter((t) => t.platform !== 'WEB')
    .map((t) => t.token);
  
  const fcmTokens = tokens
    .filter((t) => t.platform === 'WEB')
    .map((t) => t.token);

  const payload: PushNotificationPayload = { title, body, data };

  const [expoResults, fcmResults] = await Promise.all([
    sendExpoNotification(expoTokens, payload),
    sendFCMNotification(fcmTokens, payload),
  ]);

  return {
    sent: tokens.length,
    expo: expoResults.filter((r) => r.status === 'ok').length,
    fcm: fcmResults.success,
  };
};

/**
 * Send push notification to multiple users
 */
export const sendPushToMultipleUsers = async (
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>
) => {
  const tokens = await getMultipleUsersTokens(userIds);
  
  if (tokens.length === 0) {
    return { sent: 0, expo: 0, fcm: 0 };
  }

  const expoTokens = tokens
    .filter((t) => t.platform !== 'WEB')
    .map((t) => t.token);
  
  const fcmTokens = tokens
    .filter((t) => t.platform === 'WEB')
    .map((t) => t.token);

  const payload: PushNotificationPayload = { title, body, data };

  const [expoResults, fcmResults] = await Promise.all([
    sendExpoNotification(expoTokens, payload),
    sendFCMNotification(fcmTokens, payload),
  ]);

  return {
    sent: tokens.length,
    expo: expoResults.filter((r) => r.status === 'ok').length,
    fcm: fcmResults.success,
  };
};

/**
 * Broadcast push notification to all users
 */
export const sendPushToAll = async (
  title: string,
  body: string,
  data?: Record<string, string>
) => {
  const tokens = await getAllActiveTokens();
  
  if (tokens.length === 0) {
    return { sent: 0, expo: 0, fcm: 0 };
  }

  const expoTokens = tokens
    .filter((t) => t.platform !== 'WEB')
    .map((t) => t.token);
  
  const fcmTokens = tokens
    .filter((t) => t.platform === 'WEB')
    .map((t) => t.token);

  const payload: PushNotificationPayload = { title, body, data };

  const [expoResults, fcmResults] = await Promise.all([
    sendExpoNotification(expoTokens, payload),
    sendFCMNotification(fcmTokens, payload),
  ]);

  return {
    sent: tokens.length,
    expo: expoResults.filter((r) => r.status === 'ok').length,
    fcm: fcmResults.success,
  };
};
