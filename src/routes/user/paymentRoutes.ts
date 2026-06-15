import { Router } from "express";
import * as controller from "../../controllers/payment/addonPaymentController";
import { authenticate } from "../../middleware/auth";

const router = Router();

router.post("/initiate-addon", authenticate, controller.initiateAddonPayment);
router.post("/verify-addon", authenticate, controller.verifyAddonPayment);
router.get("/check-eligibility", authenticate, controller.checkEligibility);

export default router;
