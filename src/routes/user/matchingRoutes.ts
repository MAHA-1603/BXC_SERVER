import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import { requireActiveSubscription } from "../../middleware/subscriptionCheck";
import { apiLimiter } from "../../middleware/rateLimiter";
import {
  getMatchingProviders,
  getMatchingSeekers,
} from "../../controllers/user/matchingController";

const router = Router();

/**
 * GET /api/matching/seeker/:id/providers
 *
 * Find best-matching ProviderPost records for a given SeekerPost.
 * Auth required + active subscription required.
 *
 * Params : id    – SeekerPost ObjectId
 * Query  : page, limit
 */
router.get(
  "/seeker/:id/providers",
  apiLimiter,
  authenticate,
  // requireActiveSubscription,
  getMatchingProviders
);

/**
 * GET /api/matching/provider/:id/seekers
 *
 * Find best-matching SeekerPost records for a given ProviderPost.
 * Auth required + active subscription required.
 *
 * Params : id    – ProviderPost ObjectId
 * Query  : page, limit
 */
router.get(
  "/provider/:id/seekers",
  apiLimiter,
  authenticate,
  // requireActiveSubscription,
  getMatchingSeekers
);

export default router;
