import { Router } from "express";
import { authenticate, authorizeAdmin, requirePermission } from "../middleware/auth";
import {
  submitQuery,
  getMyQueries,
  getQuery,
  replyToQuery,
  getTypes,
  lookupByEmail,
  adminGetAllQueries,
  adminGetQuery,
  adminUpdateStatus,
  adminRespond,
  adminGetStats,
  guestReply,
} from "./supportController";

const router = Router();

// ============= PUBLIC ROUTES (No Auth Required) =============

// Get query types for dropdown
router.get("/types", getTypes);

// Submit a support query
router.post("/raise", submitQuery);

// Lookup queries by email (for users to check their query status)
router.get("/lookup", lookupByEmail);

// Guest reply to a query using ticketId
router.post("/guest-reply/:id", guestReply);

// ============= USER ROUTES (Auth Required) =============

// Get current user's queries
router.get("/my-queries", authenticate, getMyQueries);

// Get single query details
router.get("/:id", authenticate, getQuery);

// Reply to a query
router.post("/:id/reply", authenticate, replyToQuery);

// ============= ADMIN ROUTES (Auth Required) =============

// Admin: Get all queries
router.get(
  "/admin/all",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_SUPPORT"),
  adminGetAllQueries
);

// Admin: Get stats
router.get(
  "/admin/stats",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_SUPPORT"),
  adminGetStats
);

// Admin: Get single query
router.get(
  "/admin/:id",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_SUPPORT"),
  adminGetQuery
);

// Admin: Update status
router.patch(
  "/admin/:id/status",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_SUPPORT"),
  adminUpdateStatus
);

// Admin: Respond to query
router.patch(
  "/admin/:id/respond",
  authenticate,
  authorizeAdmin,
  requirePermission("MANAGE_SUPPORT"),
  adminRespond
);

export default router;

