import express from "express";
import {
  getEscalatedDealsController,
  resolveEscalatedDealController,
  overdueDealsController,
  getStuckDealsController,
} from "../../controllers/admin/dealController";
import { authenticate } from "../../middleware/auth";
const router = express.Router();

/**
 * @route   GET /api/admin/deals/escalateda
 * @desc    Get all escalated deals for admin review
 */
router.get("/escalated", authenticate, getEscalatedDealsController);

/**
 * @route   PATCH /api/admin/deals/:id/resolve
 * @desc    Resolve or close escalated deals
 * @body    { action: "resolved" | "dropped" | "blacklist", moderatorNotes?: string }
 */
router.patch("/:id/resolve",authenticate, resolveEscalatedDealController);

router.get("/stuckdeals", authenticate, getStuckDealsController);

router.get("/overdue", authenticate,overdueDealsController);

export default router;
