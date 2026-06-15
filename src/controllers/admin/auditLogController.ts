import { Request, Response } from "express";
import { AuditCategory } from "@prisma/client";
import * as auditLogService from "../../services/admin/auditLogService";
import { handleError } from "../../utils/errorHandler";

/**
 * GET /api/admin/audit-logs
 *
 * Query params:
 *   performedById - filter by admin/user ID
 *   category      - filter by AuditCategory enum
 *   action        - filter by exact action string
 *   targetId      - filter by affected entity ID
 *   startDate     - ISO date (logs on or after)
 *   endDate       - ISO date (logs on or before)
 *   limit         - number of results (default 100, max 500)
 *   cursor        - last item ID for pagination
 */
export const getAuditLogs = async (req: Request, res: Response) => {
  try {
    const {
      performedById,
      category,
      action,
      targetId,
      startDate,
      endDate,
      limit,
      page,
      search,
    } = req.query;

    // Validate category if provided
    if (category && !Object.values(AuditCategory).includes(category as AuditCategory)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${Object.values(AuditCategory).join(", ")}`,
      });
    }

    const result = await auditLogService.getAuditLogs({
      performedById: performedById as string,
      category: category as AuditCategory,
      action: action as string,
      targetId: targetId as string,
      startDate: startDate as string,
      endDate: endDate as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      search: search as string,
    });

    return res.status(200).json({
      success: true,
      message: "Logs fetched successfully",
      ...result,
    });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to fetch audit logs");
    return res.status(status).json(body);
  }
};

/**
 * GET /api/admin/audit-logs/user/:userId
 *
 * Fetch all logs where a user is either the performer or the target.
 *
 * Query params:
 *   startDate  - ISO date (logs on or after)
 *   endDate    - ISO date (logs on or before)
 *   category   - filter by AuditCategory enum
 *   limit      - number of results (default 100, max 500)
 *   page       - page number for pagination
 */
export const getUserLogsController = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, category, limit, page } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    // Validate category if provided
    if (category && !Object.values(AuditCategory).includes(category as AuditCategory)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${Object.values(AuditCategory).join(", ")}`,
      });
    }

    const result = await auditLogService.getUserLogs({
      userId,
      startDate: startDate as string,
      endDate: endDate as string,
      category: category as AuditCategory,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      page: page ? parseInt(page as string, 10) : undefined,
    });

    return res.status(200).json({
      success: true,
      message: "User logs fetched successfully",
      ...result,
    });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to fetch user logs");
    return res.status(status).json(body);
  }
};
