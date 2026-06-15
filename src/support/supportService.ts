import { prisma } from "../config/database";
import { QueryType, QueryStatus, SupportSenderType } from "@prisma/client";
import { sendEmail } from "../utils/email";

export interface SupportFile {
  file_name: string;
  file_url: string;
}

interface CreateSupportQueryInput {
  userId?: string;
  email: string;
  name?: string;
  phone?: string;
  queryType: QueryType;
  subject: string;
  description: string;
  platform?: string;
  files?: SupportFile[];
}

interface UpdateSupportQueryInput {
  description?: string;
  subject?: string;
  files?: SupportFile[];
}

// Generate a 12-digit numeric ticket ID
const generateTicketId = async (): Promise<string> => {
  let ticketId = "";
  let isUnique = false;
  
  while (!isUnique) {
    // Generate 12 random digits
    ticketId = "TKT" + Math.floor(Math.random() * 1000000000000).toString().padStart(12, "0");
    
    // Check for uniqueness
    const existing = await prisma.supportQuery.findUnique({
      where: { ticketId },
    });
    
    if (!existing) {
      isUnique = true;
    }
  }
  
  return ticketId;
};

// Create a new support query (user or anonymous)
export const createSupportQuery = async (data: CreateSupportQueryInput) => {
  const ticketId = await generateTicketId();

  return await prisma.supportQuery.create({
    data: {
      ticketId,
      userId: data.userId,
      email: data.email,
      name: data.name,
      phone: data.phone,
      queryType: data.queryType,
      subject: data.subject,
      description: data.description,
      platform: data.platform,
      files: (data.files || []) as any,
      status: "OPEN",
    },
  });
};

// Get all queries for a specific user
export const getUserQueries = async (userId: string) => {
  return await prisma.supportQuery.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      admin: {
        select: { fullName: true, email: true },
      },
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
};

// Get a single query by ID or Ticket ID
export const getQueryById = async (queryId: string, userId?: string) => {
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(queryId);

  const where: any = {
    OR: [
      ...(isObjectId ? [{ id: queryId }] : []),
      { ticketId: queryId }
    ]
  };

  if (userId) {
    where.userId = userId;
  }

  return await prisma.supportQuery.findFirst({
    where,
    include: {
      user: {
        select: { fullName: true, email: true, companyName: true },
      },
      admin: {
        select: { fullName: true, email: true },
      },
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
};

// User updates their query (add more details)
export const updateUserQuery = async (
  queryId: string,
  userId: string,
  data: UpdateSupportQueryInput
) => {
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(queryId);

  return await prisma.supportQuery.updateMany({
    where: {
      OR: [
        ...(isObjectId ? [{ id: queryId }] : []),
        { ticketId: queryId }
      ],
      userId
    },
    data: {
      ...(data as any),
      updatedAt: new Date(),
    },
  });
};

// Get all query types for dropdown
export const getQueryTypes = () => {
  return Object.values(QueryType);
};

// Add a message to a support query (Internal use)
export const addSupportMessage = async (
  supportQueryId: string,
  senderId: string | null | undefined,
  senderType: SupportSenderType,
  content: string,
  files?: SupportFile[]
) => {
  // Add message to DB
  const message = await prisma.supportMessage.create({
    data: {
      supportQueryId,
      ...(senderId && { senderId }),
      senderType,
      content,
      files: (files || []) as any,
    } as any,
  });

  // Get ticket details for email notification
  const query = await prisma.supportQuery.findUnique({
    where: { id: supportQueryId },
    include: { admin: true, user: true }
  });

  if (!query) return message;

  // Send email notifications
  if (senderType === "ADMIN") {
    // If Admin replies, send email to User
    await sendEmail(
      query.email,
      `Re: [${query.ticketId}] ${query.subject}`,
      `Hello ${query.name || "User"},\n\nAn admin has replied to your support ticket [${query.ticketId}]:\n\n"${content}"\n\nYou can view and reply to this ticket in the support section.\n\nBest regards,\nBenchXchange Team`,
      `<p>Hello ${query.name || "User"},</p><p>An admin has replied to your support ticket <b>${query.ticketId}</b>:</p><blockquote>${content}</blockquote><p>You can view and reply to this ticket in the support section.</p><p>Best regards,<br>BenchXchange Team</p>`
    );
  } else if (senderType === "USER") {
    // If User replies, send email to Admin (if assigned)
    if (query.admin?.email) {
      await sendEmail(
        query.admin.email,
        `User Reply: [${query.ticketId}] ${query.subject}`,
        `Hello ${query.admin.fullName},\n\nThe user has replied to ticket [${query.ticketId}]:\n\n"${content}"\n\nPlease check the admin dashboard to respond.`,
        `<p>Hello ${query.admin.fullName},</p><p>The user has replied to ticket <b>${query.ticketId}</b>:</p><blockquote>${content}</blockquote><p>Please check the admin dashboard to respond.</p>`
      );
    }
  }

  return message;
};

// ============= ADMIN FUNCTIONS =============

// Get all queries with optional filters
export const getAllQueries = async (filters?: {
  status?: QueryStatus;
  queryType?: QueryType;
  search?: string;
}) => {
  const where: any = {};

  if (filters?.status) {
    where.status = filters.status;
  }
  if (filters?.queryType) {
    where.queryType = filters.queryType;
  }
  if (filters?.search) {
    where.OR = [
      { email: { contains: filters.search, mode: "insensitive" } },
      { subject: { contains: filters.search, mode: "insensitive" } },
      { name: { contains: filters.search, mode: "insensitive" } },
      { ticketId: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return await prisma.supportQuery.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: { fullName: true, email: true, companyName: true },
      },
      messages: {
        take: 1,
        orderBy: { createdAt: "desc" }
      }
    },
  });
};

// Update query status
export const updateQueryStatus = async (
  queryId: string,
  status: QueryStatus,
  adminId?: string | null
) => {
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(queryId);

  const updateData: any = {
    status,
    updatedAt: new Date(),
  };

  if (adminId && /^[0-9a-fA-F]{24}$/.test(adminId)) {
    updateData.adminId = adminId;
  }

  if (status === "RESOLVED" || status === "CLOSED") {
    updateData.resolvedAt = new Date();
  }

  // Update by ID or Ticket ID safely
  const query = await prisma.supportQuery.findFirst({
    where: {
      OR: [
        ...(isObjectId ? [{ id: queryId }] : []),
        { ticketId: queryId }
      ]
    }
  });

  if (!query) throw new Error("Support query not found");

  return await prisma.supportQuery.update({
    where: { id: query.id },
    data: updateData,
  });
};

// Admin responds to a query
export const respondToQuery = async (
  queryId: string,
  adminId: string,
  response: string,
  files?: SupportFile[]
) => {
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(queryId);

  // Find the query first to get the actual ID
  const existingQuery = await prisma.supportQuery.findFirst({
    where: {
      OR: [
        ...(isObjectId ? [{ id: queryId }] : []),
        { ticketId: queryId }
      ]
    }
  });

  if (!existingQuery) {
    throw new Error("Support query not found");
  }

  // Maintain backward compatibility by updating the 'response' field
  const query = await prisma.supportQuery.update({
    where: { id: existingQuery.id },
    data: {
      response,
      ...(adminId && /^[0-9a-fA-F]{24}$/.test(adminId) ? { adminId } : {}),
      status: "IN_PROGRESS",
      updatedAt: new Date(),
    },
  });

  // Create a record in the message history
  await addSupportMessage(query.id, adminId, "ADMIN", response, files);

  return query;
};

// Get query stats for admin dashboard
export const getQueryStats = async () => {
  const [total, open, inProgress, resolved, closed] = await Promise.all([
    prisma.supportQuery.count(),
    prisma.supportQuery.count({ where: { status: "OPEN" } }),
    prisma.supportQuery.count({ where: { status: "IN_PROGRESS" } }),
    prisma.supportQuery.count({ where: { status: "RESOLVED" } }),
    prisma.supportQuery.count({ where: { status: "CLOSED" } }),
  ]);

  return { total, open, inProgress, resolved, closed };
};

// ============= PUBLIC EMAIL LOOKUP =============

// Get all queries by email (for anonymous users to track their queries)
export const getQueriesByEmail = async (email: string) => {
  return await prisma.supportQuery.findMany({
    where: { 
      email: { 
        equals: email, 
        mode: "insensitive" 
      } 
    },
    orderBy: { createdAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" }
      }
    }
  });
};
