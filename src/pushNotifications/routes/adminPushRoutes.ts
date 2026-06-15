import { Router } from 'express';
import { authenticate, authorizeAdmin } from '../../middleware/auth';
import * as adminPushController from '../controllers/adminPushController';

const router = Router();

// All routes require admin authentication
router.use(authenticate);
router.use(authorizeAdmin);

/**
 * @route   POST /api/admin/push/send
 * @desc    Send push notification to specific users
 * @access  Private (Admin)
 * @body    { userIds: string[], title: string, body: string, data?: Record<string, string> }
 */
router.post('/send', adminPushController.sendPushToUsers);

/**
 * @route   POST /api/admin/push/broadcast
 * @desc    Broadcast push notification to all users
 * @access  Private (Admin)
 * @body    { title: string, body: string, data?: Record<string, string> }
 */
router.post('/broadcast', adminPushController.broadcastPush);

/**
 * @route   POST /api/admin/push/user/:userId
 * @desc    Send push notification to a single user
 * @access  Private (Admin)
 * @body    { title: string, body: string, data?: Record<string, string> }
 */
router.post('/user/:userId', adminPushController.sendPushToSingleUser);

export default router;
