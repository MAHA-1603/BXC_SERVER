import { Router } from "express";
import {
  applyController,
  applyProviderPostController,
  applySeekerPostController,
  updateStatusController,
  getApplicationDetailsController,
  getProviderAppliedApplicationsController,
  getProviderReceivedApplicationsController,
  getSeekerAppliedApplicationsController,
  getSeekerReceivedApplicationsController,
} from "../../controllers/user/applicationController";

import { authenticate } from "../../middleware/auth"; // Auth middleware sets req.user

const router = Router();

router.use(authenticate);

// Apply to a post (provider or seeker)
router.post("/apply", applyController);
router.post("/provider", authenticate, applyProviderPostController);
router.post("/seeker", authenticate, applySeekerPostController);

// Provider mode endpoints
router.get(
  "/provider/applied",
  authenticate,
  getProviderAppliedApplicationsController
);
router.get(
  "/provider/received",
  authenticate,
  getProviderReceivedApplicationsController
);

// Seeker mode endpoints
router.get(
  "/seeker/applied",
  authenticate,
  getSeekerAppliedApplicationsController
);
router.get(
  "/seeker/received",
  authenticate,
  getSeekerReceivedApplicationsController
);

// Update status or retrieve application details (shared)
router.patch("/:id/status", authenticate, updateStatusController);
router.get("/:id", authenticate, getApplicationDetailsController);

export default router;
