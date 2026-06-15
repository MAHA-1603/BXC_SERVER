// Expo Push Notifications Configuration
// For mobile apps (Android & iOS) using Expo

// Expo Push API URL (defaults to official Expo server)
export const EXPO_PUSH_URL = process.env.EXPO_PUSH_URL || 'https://exp.host/--/api/v2/push/send';

// Expo Access Token (optional but recommended for production)
// Get it from: https://expo.dev/accounts/[account]/settings/access-tokens
export const EXPO_ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN || '';

export const getExpoHeaders = () => {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Accept-encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };

  if (EXPO_ACCESS_TOKEN) {
    headers['Authorization'] = `Bearer ${EXPO_ACCESS_TOKEN}`;
  }

  return headers;
};
