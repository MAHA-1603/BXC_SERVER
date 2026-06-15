import { Router } from "express";
import * as adminController from "../../controllers/admin/adminController";
import * as staffController from "../../controllers/admin/staffController";
import { authenticate, authorizeAdmin, requirePermission } from "../../middleware/auth";

const router = Router();

// Only protect admin routes (after login)
router.post("/create", adminController.createAdmin);

// Fetch all pending users
router.get(
  "/pending-users",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_USERS"),
  adminController.getPendingUsers
);

// new route to get all users
router.get(
  "/all-users",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_USERS"),
  adminController.getAllUsersController
);

// Get all providers with filtering and pagination
router.get(
  "/provider",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_USERS"),
  adminController.getProviders
);

// Get all seekers with filtering and pagination
router.get(
  "/seeker",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_USERS"),
  adminController.getSeekers
);

// Get user by email (query param: ?email=user@example.com)
router.get(
  "/user/by-email",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_USERS"),
  adminController.getUserByEmail
);

// Get user by ID
router.get(
  "/user/:userId",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_USERS"),
  adminController.getUserById
);


// Get user post stats
router.get(
  "/user/:userId/post-stats",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_USERS"),
  adminController.getUserPostStatsController
);


// Admin update user - full access to all fields
router.put(
  "/user/:userId",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_USERS"),
  adminController.updateUserByAdmin
);

// Suspend user for malicious activities
router.patch(
  "/user/:userId/suspend",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_USERS"),
  adminController.suspendUserController
);

// Unsuspend user - remove suspension
router.patch(
  "/user/:userId/unsuspend",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_USERS"),
  adminController.unsuspendUserController
);

// approve or reject user routes
router.patch(
  "/approve-user/:userId",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_USERS"),
  adminController.approveUser
);
router.put(
  "/reject-user/:userId",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_USERS"),
  adminController.rejectUser
);

// --- Staff Management Routes ---
router.post(
  "/staff",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_STAFF"),
  staffController.createStaff
);

router.get(
  "/staff",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_STAFF"),
  staffController.getStaffList
);

router.put(
  "/staff/:staffId",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_STAFF"),
  staffController.updateStaff
);

router.delete(
  "/staff/:staffId",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_STAFF"),
  staffController.deleteStaff
);

// --- Testing Routes (Manual Cron Trigger) ---


export default router;

