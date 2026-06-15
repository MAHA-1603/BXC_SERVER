import express from "express";
import {
  createAddonOrderController,
  verifyAddonPaymentController,
  handleAddonPaymentFailureController,
    getAddonPurchaseHistoryController
} from "./addonOrderController";

import { authenticate } from "../middleware/auth";
const router = express.Router();

// Request to initiate an addon purchase
router.post("/:id/purchase-addon", authenticate, createAddonOrderController);

// Webhook or callback to verify payment after user completes payment
router.post(
  "/verify-addon-payment",
  authenticate,
  verifyAddonPaymentController
);

// Endpoint to handle payment failure (could be webhook or manual trigger)
router.post(
  "/addon-payment-failed",
  authenticate,
  handleAddonPaymentFailureController
);

router.get(
  "/addon-purchase-history",
  authenticate,
  getAddonPurchaseHistoryController
);

export default router;
