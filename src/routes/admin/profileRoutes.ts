import { Router } from "express";
import * as profileController from "../../controllers/admin/profileController";
import { authenticate, authorizeAdmin } from "../../middleware/auth";

const router = Router();

// Admin profile
router.get(
  "/profile",
  authenticate,
  authorizeAdmin,
  profileController.getProfile
);
router.put(
  "/profile",
  authenticate,
  authorizeAdmin,
  profileController.updateProfile
);

export default router;
