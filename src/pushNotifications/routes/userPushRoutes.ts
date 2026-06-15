import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import * as userPushController from '../controllers/userPushController';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/push/device-token
 * @desc    Register a device push token
 * @access  Private (User)
 * @body    { token: string, platform: 'ANDROID' | 'IOS' | 'WEB', deviceId?: string }
 */
router.post('/device-token', userPushController.registerToken);

/**
 * @route   DELETE /api/push/device-token
 * @desc    Remove a specific device token
 * @access  Private (User)
 * @body    { token: string }
 */
router.delete('/device-token', userPushController.removeToken);

/**
 * @route   DELETE /api/push/device-tokens
 * @desc    Remove all device tokens (logout from all devices)
 * @access  Private (User)
 */
router.delete('/device-tokens', userPushController.removeAllTokens);

/**
 * @route   GET /api/push/device-tokens
 * @desc    Get all registered device tokens for current user
 * @access  Private (User)
 */
router.get('/device-tokens', userPushController.getMyTokens);

/**
 * @route   POST /api/push/test
 * @desc    Send a test push notification to current user
 * @access  Private (User)
 */
router.post('/test', userPushController.sendTestPush);

/**
 * @route   GET /api/push/check
 * @desc    Check if user has registered push tokens
 * @access  Private (User)
 * @query   platform?: 'ANDROID' | 'IOS' | 'WEB' (optional filter)
 */
router.get('/check', userPushController.checkTokenStatus);

/**
 * @route   PUT /api/push/device-token
 * @desc    Replace device token by platform/device (removes old, registers new)
 * @access  Private (User)
 * @body    { token: string, platform: 'ANDROID' | 'IOS' | 'WEB', deviceId?: string }
 */
router.put('/device-token', userPushController.replaceToken);

export default router;
