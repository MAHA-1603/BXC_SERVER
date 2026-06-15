import express from "express";
import {
  offerDealController,
  confirmDealController,
  rejectDealOfferController,
  cancelOfferController,
  getDealById,
  updateDealStageController,
  escalateDealController,
} from "../../controllers/user/dealController";

import { authenticate } from "../../middleware/auth";
const router = express.Router();

// Owner offers a deal (sends offer to applicant)
router.post("/offer-deal", authenticate,  offerDealController);

// Applicant confirms the offer (creates deal)
router.post("/:applicationId/confirm", authenticate, confirmDealController);

// Applicant rejects the offer
router.post("/:applicationId/reject", authenticate, rejectDealOfferController);

// Owner cancels his offer (before applicant responds)
router.post("/:applicationId/cancel", authenticate, cancelOfferController);





/**
 * @route   GET /api/deal/:id
 * @desc    Get deal details
 */
router.get("/:id", getDealById);

/**
 * @route   PATCH /api/deal/:id/updateStage
 * @desc    Update deal stage manually
 * @body    { stage: string, reason?: string }
 */
router.patch("/:id/updateStage",authenticate, updateDealStageController);

/**
 * @route   POST /api/deal/:id/escalate
 * @desc    Escalate a deal issue to moderation
 * @body    { issueCategory: string, moderatorNotes?: string }
 */
router.post("/:id/raise/issue",authenticate, escalateDealController);



export default router;
