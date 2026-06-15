// routes/userRoutes.ts
import express from "express";
import { authenticate } from "../../middleware/auth";
import * as userController from "../../controllers/user/userController";
import * as userDashboardController from "../../controllers/user/userDashboardController";

const router = express.Router();

router.get("/profile", authenticate, userController.getMyProfile);
router.get(
  "/addon-summary",
  authenticate,
  userController.getUserAddOnSummary
);
router.get("/addons", authenticate, userController.getAllAddons);
router.get(
  "/othersProfile/:userId",
  authenticate,
  userController.getUserProfile
);
router.put("/updateProfile", authenticate, userController.updateProfile);

// User Dashboard Stats
router.get("/dashboard/stats", authenticate, userDashboardController.getDashboardStats);

export default router;
