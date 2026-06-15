import { Router } from "express";
import { getDashboardStats } from "../../controllers/admin/dashboardController";
import { authenticate, authorizeAdmin } from "../../middleware/auth";

const router = Router();

// GET /api/admin/dashboard/stats
router.get("/dashboard/stats", authenticate, authorizeAdmin, getDashboardStats);

export default router;
