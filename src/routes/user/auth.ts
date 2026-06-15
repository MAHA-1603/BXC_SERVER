import { Router } from "express";
import * as authController from "../../controllers/user/authController";
import { authenticate } from "../../middleware/auth";
import { authLimiter, registrationLimiter } from "../../middleware/rateLimiter";

const router = Router();

router.post("/register", authController.register);
router.post("/login", authLimiter, authController.login);
router.post("/social-login", authLimiter, authController.socialLogin);
router.post("/user-details", authController.getUserDetails);
router.put("/reapply", authController.reapply);
router.post("/forgot-password", authController.forgotPassword);
router.put("/reset-password", authController.resetPassword);
router.post("/send-login-otp", authLimiter, authController.sendLoginOTP);
router.post("/login-with-otp", authLimiter, authController.loginWithOTP);
router.get("/me", authenticate, authController.me);

export default router;
