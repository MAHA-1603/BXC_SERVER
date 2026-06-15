import { prisma } from "../../config/database";
import { AuditCategory } from "@prisma/client";

interface AuditLogFilters {
  performedById?: string;
  category?: AuditCategory;
  action?: string;
  targetId?: string;
  startDate?: string; // ISO date string
  endDate?: string;   // ISO date string
  limit?: number;
  page?: number;      // page number for pagination
  search?: string;    // search text for user name or description
  cursor?: string;    // kept for type compatibility
}

/**
 * Fetch audit logs with flexible filters and page-based pagination.
 */
export const getAuditLogs = async (filters: AuditLogFilters) => {
  const limit = Math.min(filters.limit || 10, 500);
  const page = filters.page || 1;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {};

  if (filters.performedById) {
    where.performedById = filters.performedById;
  }

  if (filters.category) {
    where.category = filters.category;
  }

  if (filters.action) {
    where.action = filters.action;
  }

  if (filters.targetId) {
    where.targetId = filters.targetId;
  }

  if (filters.search) {
    where.OR = [
      { performedByName: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
      { action: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) {
      where.createdAt.gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = endDate;
    }
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" as const },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    data: logs,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Fetch all audit logs for a specific user with page-based pagination.
 */
export const getUserLogs = async (filters: {
  userId: string;
  startDate?: string;
  endDate?: string;
  category?: AuditCategory;
  limit?: number;
  page?: number;
  cursor?: string;
}) => {
  const limit = Math.min(filters.limit || 10, 500);
  const page = filters.page || 1;
  const skip = (page - 1) * limit;

  // Build date filter
  const dateFilter: any = {};
  if (filters.startDate) {
    dateFilter.gte = new Date(filters.startDate);
  }
  if (filters.endDate) {
    const endDate = new Date(filters.endDate);
    endDate.setHours(23, 59, 59, 999);
    dateFilter.lte = endDate;
  }

  const where: any = {
    OR: [
      { performedById: filters.userId },
      { targetId: filters.userId },
    ],
  };

  if (Object.keys(dateFilter).length > 0) {
    where.createdAt = dateFilter;
  }

  if (filters.category) {
    where.category = filters.category;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" as const },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    data: logs,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};
