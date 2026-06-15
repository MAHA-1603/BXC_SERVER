import { Request } from "express";
import { prisma } from "../config/database";
import { AuditCategory } from "@prisma/client";

interface AuditLogInput {
  action: string;
  category: AuditCategory;
  targetId?: string;
  targetType?: string;
  description: string;
  metadata?: Record<string, any>;
  actor?: any; // To forcefully provide a user (e.g. during login)
}

export const logAudit = (req: Request, input: AuditLogInput): void => {
  const user = input.actor || (req as any).user;

  if (!user) {
    console.warn("[AuditLog] Skipped: No user context found for action", input.action);
    return; // safety guard
  }

  const data = {
    action: input.action,
    category: input.category,
    performedById: user.id,
    performedByName: user.fullName || user.email || "Unknown",
    performedByRole: user.adminRole || user.role || "UNKNOWN",
    targetId: input.targetId,
    targetType: input.targetType,
    description: input.description,
    metadata: input.metadata || undefined,
    ipAddress: (req.headers["x-forwarded-for"] as string) || req.ip || undefined,
    userAgent: req.headers["user-agent"] || undefined,
  };

 // console.log(`[AuditLog] Attempting to create log for action ${input.action} with data:`, JSON.stringify(data, null, 2));

  // Fire-and-forget — do NOT await this; we don't want audit logging to slow
  // down or break the actual request.
  prisma.auditLog
    .create({ data })
    .catch((err) => {
      console.error(`[AuditLog] Failed to write audit log for action ${input.action}:`);
      console.error(err);
    });
};
