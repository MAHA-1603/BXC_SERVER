import { Router } from "express";
import * as subscriptionController from "../subscriptions/userSubController";

import { authenticate } from "../middleware/auth";
const router = Router();

router.post(
  "/user/activate-free-plan",
  authenticate,
  subscriptionController.activateFreePlanController
);

router.get(
  "/plans-and-addons",
  authenticate,
  subscriptionController.getPlansAndAddOns
);

router.get(
  "/plans-and-addons/noauth",
  subscriptionController.getPlansAndAddOns
);

// Subscription routes
router.post(
  "/subscribe-plan",
  authenticate,
  subscriptionController.subscriptionController
);

router.post(
  "/verify-payment",
  authenticate,
  subscriptionController.verifyPaymentController
);

router.post(
  "/payment-failure",
  authenticate,
  subscriptionController.paymentFailureController
);

router.get(
  "/history",
  authenticate,
  subscriptionController.userSubscriptionHistoryController
);

// router.post('/refund', authMiddleware, requestRefund); 

// Upgrade routes
router.post(
  "/upgrade-plan",
  authenticate,
  subscriptionController.upgradeSubscriptionController
);

router.post(
  "/verify-upgrade-payment",
  authenticate,
  subscriptionController.verifyUpgradePaymentController
);

export default router;
