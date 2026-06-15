// Push Notification Types

export type Platform = 'ANDROID' | 'IOS' | 'WEB';

// DeviceToken interface (matches Prisma model)
export interface DeviceToken {
  id: string;
  userId: string;
  token: string;
  platform: Platform;
  deviceId: string | null;
  isActive: boolean;
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface RegisterTokenRequest {
  token: string;
  platform: Platform;
  deviceId?: string;
}

export interface RemoveTokenRequest {
  token: string;
}

export interface SendPushRequest {
  userIds?: string[];       // Specific users (if not provided, sends to all)
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
}

export interface FCMMessage {
  token: string;
  notification: {
    title: string;
    body: string;
  };
  data?: Record<string, string>;
  webpush?: {
    notification: {
      icon?: string;
      badge?: string;
    };
  };
}
