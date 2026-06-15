// routes/adminRoutes.ts
import express from "express";
import * as adminController from "../../controllers/admin/paymentInfoController";

import { authenticate, authorizeAdmin, requirePermission } from "../../middleware/auth";

const router = express.Router();

// User specific endpoints
router.get(
  "/user/payments",
  authenticate,
  authorizeAdmin,
  requirePermission("VIEW_PAYMENTS"),
  adminController.getUserPayments
);
router.get(
  "/user/subscriptions",
  authenticate,
  authorizeAdmin,
  requirePermission("VIEW_PAYMENTS"),
  adminController.getUserSubscriptions
);
router.get(
  "/user/addons",
  authenticate,
  authorizeAdmin,
  requirePermission("VIEW_PAYMENTS"),
  adminController.getUserAddonPurchases
);

// Admin wide endpoints
router.get(
  "/subscriptions",
  authenticate,
  authorizeAdmin,
  requirePermission("VIEW_PAYMENTS"),
  adminController.getAllSubscriptions
);
router.get(
  "/revenue",
  authenticate,
  authorizeAdmin,
  requirePermission("VIEW_PAYMENTS"),
  adminController.getRevenue
);

router.get(
  "/addons/unified",
  authenticate,
  authorizeAdmin,
  requirePermission("VIEW_PAYMENTS"),
  adminController.getUnifiedAddonHistory
);

export default router;
