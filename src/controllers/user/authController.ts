import { Request, Response } from "express";
import * as authService from "../../services/user/authService";
import { handleError } from "../../utils/errorHandler";
import { logAudit } from "../../utils/auditHelper";

// User registration
export const register = async (req: Request, res: Response) => {
  try {
    const user = await authService.registerUser(req.body);
    logAudit(req, {
      action: "USER_REGISTERED",
      category: "AUTH",
      targetId: user.id,
      targetType: "User",
      description: `New user registered: ${user.fullName || user.email}`,
      actor: user,
    });
    res.status(201).json({
      message: "Registration successful. Pending admin approval",
      user,
    });
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Registration failed");
    res.status(status).json(body);
  }
};

// User login
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const { token, user } = await authService.loginUser(email, password);
    logAudit(req, {
      action: "USER_LOGIN",
      category: "AUTH",
      targetId: user.id,
      targetType: "User",
      description: `User logged in: ${user.email}`,
      actor: user,
    });
    res.json({
      message: "Login successful",
      token,
      user,
    });
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Login failed");
    res.status(status).json(body);
  }
};

// Google Social Login (with token verification)
export const socialLogin = async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;

    // Validate required field
    if (!idToken) {
      return res.status(400).json({
        error: "Missing required field: idToken",
      });
    }

    const result = await authService.socialLogin(idToken);

    logAudit(req, {
      action: "USER_LOGIN",
      category: "AUTH",
      targetId: result.user.id,
      targetType: "User",
      description: `User logged in via social login: ${result.user.email}`,
      metadata: { method: "social" },
      actor: result.user,
    });

    // Return SAME response as regular login
    res.json({
      message: "Login successful",
      token: result.token,
      user: result.user,
    });
  } catch (err: any) {
    const { status, body } = handleError.full(err, "Social login failed");
    res.status(status).json(body);
  }
};

// Forgot password - send OTP
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const result = await authService.forgotPassword(email);
    res.json(result);
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to send reset code");
    res.status(status).json(body);
  }
};

// Reset password using OTP
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body;
    const result = await authService.resetPassword(email, otp, newPassword);
    logAudit(req, {
      action: "PASSWORD_RESET",
      category: "AUTH",
      targetType: "User",
      description: `Password reset for: ${email}`,
      // Cannot properly log without valid user ID (ObjectId), so we don't log the actor directly here
      // But audit logs require an actor. If it fails due to missing actor, it's safer than crashing.
    });
    res.json(result);
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to reset password");
    res.status(status).json(body);
  }
};

export const me = async (req: Request, res: Response) => {
  const user = (req as any).user;
  res.json(user);
};

// Get user details by email
export const getUserDetails = async (req: Request, res: Response) => {
  try {
    const { email } = req.body; // ?email=abc@example.com
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await authService.getUserDetails(email as string);
    res.status(200).json(user);
  } catch (error: any) {
    const { status, body } = handleError.full(error, "User not found");
    res.status(status).json(body);
  }
};

//  Reapply with new details
export const reapply = async (req: Request, res: Response) => {
  try {
    const { email, ...newData } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await authService.reapplyUser(email, newData);
    logAudit(req, {
      action: "USER_REAPPLIED",
      category: "AUTH",
      targetId: user.id,
      targetType: "User",
      description: `User reapplied: ${email}`,
      actor: user,
    });
    res.status(200).json({ message: "Reapplied successfully", user });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Reapplication failed");
    res.status(status).json(body);
  }
};

// Send OTP for login
export const sendLoginOTP = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });
    
    const result = await authService.sendLoginOTP(email);
    res.json(result);
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Failed to send login OTP");
    res.status(status).json(body);
  }
};

// Login using OTP
export const loginWithOTP = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const result = await authService.loginWithOTP(email, otp);

    logAudit(req, {
      action: "USER_LOGIN_OTP",
      category: "AUTH",
      targetId: result.user.id,
      targetType: "User",
      description: `User logged in via OTP: ${result.user.email}`,
      actor: result.user,
    });

    res.json({
      message: "Login successful",
      token: result.token,
      user: result.user,
    });
  } catch (error: any) {
    const { status, body } = handleError.full(error, "Login with OTP failed");
    res.status(status).json(body);
  }
};
