import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import { providerDashboardController } from "../../controllers/dasboardController/providerDasboard";

const router = Router();

router.get("/dashboard", authenticate, providerDashboardController);

export default router;
