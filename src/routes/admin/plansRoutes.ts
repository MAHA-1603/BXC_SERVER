// routes/planRoutes.js
import express from "express";
const router = express.Router();
import * as planController from "../../controllers/admin/planController";
import { authenticate, authorizeAdmin } from "../../middleware/auth";

// Admin APIs
router.post("/plans", authenticate, authorizeAdmin, planController.createPlan);
router.get("/plans", authenticate, authorizeAdmin, planController.getPlans);
router.patch(
  "/plans/:id",
  authenticate,
  authorizeAdmin,
  planController.updatePlan
);
router.delete(
  "/plans/:id",
  authenticate,
  authorizeAdmin,
  planController.deletePlan
);

// Public/API fetch
// router.get("/plans", authenticate, planController.getAllPlans);
router.get("/plans/localized", planController.getPlans);

export default router;
