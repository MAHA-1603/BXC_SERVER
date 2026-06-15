/**
 * Production-safe error handling utility
 * Prevents leaking Prisma/database errors in API responses
 */

// Define known safe error messages that can be shown to users
const SAFE_ERROR_MESSAGES = [
  "User already exists",
  "User not found",
  "Invalid password",
  "Invalid OTP",
  "OTP expired",
  "User not approved yet",
  "Your account has been suspended. Please contact support.",
  "Your account is still pending approval.",
  "Your account has been rejected.",
  "Your account is not approved.",
  "Rejection reason is required",
  "User is already approved and cannot be rejected",
  "Email query parameter is required",
  "User not found with this email",
  "Suspension reason is required",
  "User is already suspended",
  "User is not suspended",
  "You can only reapply if your account was rejected",
  "Invalid Razorpay payment signature",
  "Unauthorized",
  "Already applied to this provider post",
  "Unable to process application at this time",
  "Your profile application limit has been reached.",
];

// Patterns for safe messages (partial matches)
const SAFE_MESSAGE_PATTERNS = [
  /^A company with domain .+ already exists/,
  /already has an active subscription/i,
  /not found/i,
  /is required/i,
  /already exists/i,
  /not approved/i,
  /is suspended/i,
];

const isProduction = process.env.NODE_ENV === "production";

/**
 * Checks if an error message is safe to show to users
 */
function isSafeMessage(message: string): boolean {
  // Check exact matches
  if (SAFE_ERROR_MESSAGES.includes(message)) {
    return true;
  }
  
  // Check patterns
  return SAFE_MESSAGE_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Custom application error for controlled error responses
 */
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Extracts a safe error message from any error
 * In production, only returns known-safe messages
 * In development, returns the actual error message
 */
export function getSafeErrorMessage(error: unknown, fallbackMessage = "An error occurred"): string {
  if (error instanceof AppError) {
    return error.message; // AppError messages are always safe
  }

  let message = "An error occurred";
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "object" && error !== null) {
    message = JSON.stringify(error);
  } else {
    message = String(error);
  }

  // In development, return the actual message for debugging
  if (!isProduction) {
    return message;
  }

  // In production, only return safe messages
  if (isSafeMessage(message)) {
    return message;
  }

  // Log the actual error for debugging (server-side only)
  console.error("[HIDDEN FROM RESPONSE]", error);
  
  return fallbackMessage;
}

/**
 * Get appropriate HTTP status code from error
 */
export function getErrorStatusCode(error: unknown): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    // 404 - Not Found
    if (message.includes("not found")) {
      return 404;
    }
    
    // 409 - Conflict
    if (message.includes("already exists") || message.includes("already has")) {
      return 409;
    }
    
    // 401 - Unauthorized
    if (message.includes("unauthorized") || message.includes("invalid password")) {
      return 401;
    }
    
    // 403 - Forbidden
    if (message.includes("suspended") || message.includes("not approved")) {
      return 403;
    }

    // 402 - Payment Required / quota limits
    if (message.includes("limit has been reached")) {
      return 402;
    }
  }

  return 500;
}

/**
 * Helper to handle errors in controllers
 * Usage: res.status(handleError.status(error)).json(handleError.response(error))
 */
export const handleError = {
  status: getErrorStatusCode,
  
  response: (error: unknown, fallbackMessage = "An error occurred") => ({
    success: false,
    message: getSafeErrorMessage(error, fallbackMessage),
  }),

  /**
   * Full handler that returns both status and response body
   */
  full: (error: unknown, fallbackMessage = "An error occurred") => ({
    status: getErrorStatusCode(error),
    body: {
      success: false,
      message: getSafeErrorMessage(error, fallbackMessage),
    },
  }),
};

/**
 * Express error handler middleware for global error handling
 */
export function globalErrorHandler(
  err: any, 
  _req: any, 
  res: any, 
  _next: any
): void {
  const statusCode = getErrorStatusCode(err);
  const message = getSafeErrorMessage(err, "Internal Server Error");

  // Always log errors server-side
  console.error(`[${statusCode}]`, err);

  res.status(statusCode).json({
    success: false,
    message,
    ...(isProduction ? {} : { stack: err.stack }), // Include stack trace in dev only
  });
}
