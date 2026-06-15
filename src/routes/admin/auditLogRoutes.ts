import { Router } from "express";
import { authenticate, authorizeAdmin, requirePermission } from "../../middleware/auth";
import * as auditLogController from "../../controllers/admin/auditLogController";

const router = Router();

// Fetch audit logs with optional filters
router.get(
  "/audit-logs",
  authenticate,
  authorizeAdmin,
  requirePermission("VIEW_AUDIT_LOGS"),
  auditLogController.getAuditLogs
);

// Fetch all logs for a specific user (by userId)
router.get(
  "/audit-logs/user/:userId",
  authenticate,
  authorizeAdmin,
  requirePermission("VIEW_AUDIT_LOGS"),
  auditLogController.getUserLogsController
);

export default router;
