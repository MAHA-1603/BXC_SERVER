import { Router } from "express";
import * as adminSubscriptionController from "../../controllers/admin/adminSubscriptionController";
import { authenticate, authorizeAdmin, requirePermission } from "../../middleware/auth";

const router = Router();

router.get(
  "/user/:userId/subscription",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_USERS"),
  adminSubscriptionController.getUserSubscription
);

router.put(
  "/user/:userId/subscription",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_USERS"),
  adminSubscriptionController.updateUserSubscription
);

export default router;
