import hpp from "hpp";
import { Request, Response, NextFunction } from "express";

// -----------------------------
// MongoDB Sanitization (Express 5 Compatible)
// -----------------------------
// Remove $ and . from keys to prevent NoSQL injection
// Sanitizes in-place to avoid "Cannot set property query" error in Express 5
export const mongoSanitizer = (req: Request, res: Response, next: NextFunction) => {
  if (req.body) sanitizeMongoInPlace(req.body);
  if (req.query) sanitizeMongoInPlace(req.query);
  if (req.params) sanitizeMongoInPlace(req.params);
  next();
};

// Recursively sanitize object keys containing $ or . (NoSQL injection prevention)
function sanitizeMongoInPlace(obj: any, replaceWith: string = "_"): void {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    obj.forEach((item) => sanitizeMongoInPlace(item, replaceWith));
    return;
  }

  Object.keys(obj).forEach((key) => {
    // Recursively sanitize nested objects
    if (typeof obj[key] === "object" && obj[key] !== null) {
      sanitizeMongoInPlace(obj[key], replaceWith);
    }

    // Check if key contains prohibited characters ($ or .)
    if (key.includes("$") || key.includes(".")) {
      const sanitizedKey = key.replace(/[$\.]/g, replaceWith);
      obj[sanitizedKey] = obj[key];
      delete obj[key];
    }
  });
}

// -----------------------------
// XSS Sanitizer
// -----------------------------
export const xssSanitizer = (req: Request, res: Response, next: NextFunction) => {
  if (req.body) sanitizeInPlace(req.body);
  if (req.query) sanitizeInPlace(req.query);   // mutate instead of replace
  if (req.params) sanitizeInPlace(req.params); // mutate instead of replace
  next();
};

function sanitizeString(str: string) {
  return str
    .replace(/<script.*?>.*?<\/script>/gi, "")
    // .replace(/<.*?>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=/gi, "");
}

function sanitizeInPlace(obj: any) {
  if (!obj) return;

  if (typeof obj === "string") return sanitizeString(obj);

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      obj[i] = sanitizeInPlace(item);
    });
    return obj;
  }

  if (typeof obj === "object") {
    Object.keys(obj).forEach((key) => {
      if (typeof obj[key] === "string") {
        obj[key] = sanitizeString(obj[key]);
      } else {
        sanitizeInPlace(obj[key]);
      }
    });
  }

  return obj;
}

// -----------------------------
// HTTP Parameter Pollution Protection
// -----------------------------
export const hppProtection = hpp();
