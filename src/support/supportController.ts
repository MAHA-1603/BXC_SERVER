import { Request, Response } from "express";
import {
  createSupportQuery,
  getUserQueries,
  getQueryById,
  updateUserQuery,
  getQueryTypes,
  getAllQueries,
  updateQueryStatus,
  respondToQuery,
  getQueryStats,
  getQueriesByEmail,
  addSupportMessage,
} from "./supportService";
import { QueryType, QueryStatus, SupportSenderType } from "@prisma/client";
import { handleError } from "../utils/errorHandler";
import { logAudit } from "../utils/auditHelper";

// ============= USER ENDPOINTS =============

// Submit a new support query (works for logged-in and anonymous users)
export const submitQuery = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id; // Optional - may be undefined for anonymous
    const { email, name, phone, queryType, subject, description, platform, files } = req.body;

    // Validate required fields
    if (!email || !queryType || !subject || !description) {
      return res.status(400).json({
        error: "Missing required fields: email, queryType, subject, description",
      });
    }

    // Validate queryType is valid
    if (!Object.values(QueryType).includes(queryType)) {
      return res.status(400).json({
        error: `Invalid queryType. Must be one of: ${Object.values(QueryType).join(", ")}`,
      });
    }

    const query = await createSupportQuery({
      userId,
      email,
      name,
      phone,
      queryType,
      subject,
      description,
      platform,
      files,
    });

    logAudit(req, {
      action: "SUPPORT_QUERY_SUBMITTED",
      category: "SUPPORT",
      targetId: query.id,
      targetType: "SupportQuery",
      description: `Support query submitted by ${email}: ${subject}`,
      metadata: { queryType, platform },
    });

    res.status(201).json({
      message: "Support query submitted successfully",
      query,
    });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to submit support query");
    res.status(status).json(body);
  }
};

// Get all queries for the logged-in user
export const getMyQueries = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const queries = await getUserQueries(userId);

    res.json({
      message: "Queries fetched successfully",
      queries,
    });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to fetch queries");
    res.status(status).json(body);
  }
};

// Get a single query by ID or Ticket ID
export const getQuery = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    const query = await getQueryById(id, userId);

    if (!query) {
      return res.status(404).json({ error: "Query not found" });
    }

    res.json({ query });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to fetch query");
    res.status(status).json(body);
  }
};

// User replies to a query
export const replyToQuery = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { content, files } = req.body;
    const userId = (req as any).user.id;

    if (!content) {
      return res.status(400).json({ error: "Content is required" });
    }

    // Check if query exists and belongs to user
    const query = await getQueryById(id, userId);
    if (!query) {
      return res.status(404).json({ error: "Query not found or unauthorized" });
    }

    const message = await addSupportMessage(query.id, userId, "USER", content, files);

    // Also update the updatedAt timestamp of the main query
    await updateUserQuery(query.id, userId, {});

    logAudit(req, {
      action: "SUPPORT_QUERY_REPLIED",
      category: "SUPPORT",
      targetId: query.id,
      targetType: "SupportQuery",
      description: `User replied to support query ${query.id}`,
    });

    res.status(201).json({
      message: "Reply sent successfully",
      data: message,
    });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to send reply");
    res.status(status).json(body);
  }
};

// Guest/Anonymous user replies to a query using ticket ID
export const guestReply = async (req: Request, res: Response) => {
  try {
    const ticketId = req.params.id;
    const { content, files } = req.body;

    if (!ticketId || !content) {
      return res.status(400).json({ error: "ticketId (in URL) and content are required" });
    }

    // Find the exact query that matches the provided ticketId
    const query = await getQueryById(ticketId);

    if (!query) {
      return res.status(404).json({ error: "Query not found" });
    }

    // Add exactly like replyToQuery but senderType is "USER" with null senderId
    const message = await addSupportMessage(query.id, null, "USER", content, files);

    // Update query status to open/updated. Maintain existing admin if already assigned.
    await updateQueryStatus(query.id, "OPEN", query.adminId);

    logAudit(req, {
      action: "SUPPORT_QUERY_GUEST_REPLIED",
      category: "SUPPORT",
      targetId: query.id,
      targetType: "SupportQuery",
      description: `Guest (${query.email}) replied to support query ${query.id}`,
    });

    res.status(201).json({
      message: "Reply sent successfully",
      data: message,
    });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to send reply");
    res.status(status).json(body);
  }
};

// Update a query (user adds more details)
export const updateQuery = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;
    const { subject, description, files } = req.body;

    const result = await updateUserQuery(id, userId, { subject, description, files });

    if (result.count === 0) {
      return res.status(404).json({ error: "Query not found or not authorized" });
    }

    logAudit(req, {
      action: "SUPPORT_QUERY_UPDATED",
      category: "SUPPORT",
      targetId: id,
      targetType: "SupportQuery",
      description: `User updated support query ${id} details`,
    });

    res.json({ message: "Query updated successfully" });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to update query");
    res.status(status).json(body);
  }
};

// Get available query types for dropdown
export const getTypes = async (_req: Request, res: Response) => {
  try {
    const types = getQueryTypes();
    res.json({ types });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to fetch query types");
    res.status(status).json(body);
  }
};

// Lookup queries by email (public - for anonymous users)
export const lookupByEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.query;

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        error: "Email is required",
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: "Invalid email format",
      });
    }

    const queries = await getQueriesByEmail(email);

    res.json({
      message: "Queries fetched successfully",
      count: queries.length,
      queries,
    });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to lookup queries");
    res.status(status).json(body);
  }
};

// ============= ADMIN ENDPOINTS =============

// Get all queries with optional filters
export const adminGetAllQueries = async (req: Request, res: Response) => {
  try {
    const { status, queryType, search } = req.query;

    const queries = await getAllQueries({
      status: status as QueryStatus,
      queryType: queryType as QueryType,
      search: search as string,
    });

    res.json({
      message: "Queries fetched successfully",
      count: queries.length,
      queries,
    });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to fetch queries");
    res.status(status).json(body);
  }
};

// Get single query details (admin)
export const adminGetQuery = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const query = await getQueryById(id);

    if (!query) {
      return res.status(404).json({ error: "Query not found" });
    }

    res.json({ query });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to fetch query");
    res.status(status).json(body);
  }
};

// Update query status
export const adminUpdateStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const adminId = (req as any).user.id;

    if (!Object.values(QueryStatus).includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${Object.values(QueryStatus).join(", ")}`,
      });
    }

    const query = await updateQueryStatus(id, status, adminId);

    logAudit(req, {
      action: "SUPPORT_QUERY_STATUS_UPDATED",
      category: "SUPPORT",
      targetId: id,
      targetType: "SupportQuery",
      description: `Admin updated support query ${id} status to ${status}`,
    });

    res.json({
      message: "Status updated successfully",
      query,
    });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to update status");
    res.status(status).json(body);
  }
};

// Admin responds to a query
export const adminRespond = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { response, files } = req.body;
    const adminId = (req as any).user.id;

    if (!response) {
      return res.status(400).json({ error: "Response is required" });
    }

    const query = await respondToQuery(id, adminId, response, files);

    logAudit(req, {
      action: "SUPPORT_QUERY_RESPONDED",
      category: "SUPPORT",
      targetId: id,
      targetType: "SupportQuery",
      description: `Admin responded to support query ${id}`,
    });

    res.json({
      message: "Response sent successfully",
      query,
    });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to respond to query");
    res.status(status).json(body);
  }
};

// Get query statistics for admin dashboard
export const adminGetStats = async (_req: Request, res: Response) => {
  try {
    const stats = await getQueryStats();
    res.json({ stats });
  } catch (error) {
    const { status, body } = handleError.full(error, "Failed to fetch stats");
    res.status(status).json(body);
  }
};
