import { prisma } from "../../config/database";

/**
 * Fetch all deals that are currently escalated or have admin resolution actions,
 * and categorize them by status for easier admin dashboard rendering.
 *
 * Returns an object with arrays for:
 * - pending    : Deals currently escalated (`isEscalated: true`)
 * - resolved   : Deals marked as resolved by admin (`adminAction: "resolved"`)
 * - dropped    : Deals marked as dropped by admin (`adminAction: "dropped"`)
 * - blacklist  : Deals marked as blacklisted by admin (`adminAction: "blacklist"`)
 */
export async function getAllEscalatedAndResolvedDeals(adminId : string) {
   // Check if user is an admin
  const adminUser = await prisma.admin.findUnique({
    where: { id: adminId },
  });
  if (!adminUser) throw new Error("User is not authorized as an admin");
  // Fetch all relevant deals
  const deals = await prisma.dealLifecycle.findMany({
    where: {
      OR: [
        { isEscalated: true },
        { adminAction: { in: ["resolved", "dropped", "blacklist"] } },
      ],
    },
    include: {
      application: {
        include: {
          applicant: {
            select: { fullName: true, companyName: true, email: true },
          },
          providerPost: { select: { id: true, title: true } },
          seekerPost: { select: { id: true, title: true } },
        },
      },
      escalationConversation: {
        select: { id: true }, // Include escalation conversation ID here
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Prepare categorized object
  const categorized = {
    pending: [] as typeof deals,
    resolved: [] as typeof deals,
    dropped: [] as typeof deals,
    blacklist: [] as typeof deals,
  };

  // Categorize deals based on escalated and adminAction status
  for (const deal of deals) {
    if (deal.isEscalated) {
      categorized.pending.push(deal);
    } else {
      switch (deal.adminAction) {
        case "resolved":
          categorized.resolved.push(deal);
          break;
        case "dropped":
          categorized.dropped.push(deal);
          break;
        case "blacklist":
          categorized.blacklist.push(deal);
          break;
        default:
          // Edge case: treat unknown or null adminAction as pending escalation
          categorized.pending.push(deal);
          break;
      }
    }
  }

  return categorized;
}

/**
 * Get overdue deals for admin categorized by escalation status.
 * - Filters deals where nextActionDue <= now date.
 */
export async function getOverdueDealsForAdmin(adminId : string) {
  const now = new Date();

   // Check if user is an admin
  const adminUser = await prisma.admin.findUnique({
    where: { id: adminId },
  });
  if (!adminUser) throw new Error("User is not authorized as an admin");

  const deals = await prisma.dealLifecycle.findMany({
    where: {
      nextActionDue: { lte: now },
    },
    include: {
      application: {
        include: {
          applicant: {
            select: { fullName: true, companyName: true, email: true },
          },
          providerPost: { select: { id: true, title: true } },
          seekerPost: { select: { id: true, title: true } },
        },
      },
    
    },
    orderBy: { updatedAt: "desc" },
  });

  return deals;
}


/**
 * Fetch all deals currently stuck and flagged for review (STUCK_NEEDS_REVIEW stage),
 * accessible only by verified admin users.
 */
export async function getStuckDealsForAdmin(adminId: string) {
  // Validate admin user
  const adminUser = await prisma.admin.findUnique({
    where: { id: adminId },
  });
  if (!adminUser) throw new Error("User is not authorized as an admin");

  // Fetch stuck deals categorized (optional)
  const deals = await prisma.dealLifecycle.findMany({
    where: {
      stage: "STUCK_NEEDS_REVIEW",
    },
    include: {
      application: {
        include: {
          applicant: {
            select: { fullName: true, companyName: true, email: true },
          },
          providerPost: { select: { id: true, title: true } },
          seekerPost: { select: { id: true, title: true } },
        },
      },
      resolvedBy: { select: { id: true, fullName: true, email: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return deals;
}


/**
 * Resolve an escalated deal (admin action)
 */
export async function resolveEscalatedDeal(
  dealId: string,
  adminId: string,
  action: "resolved" | "dropped" | "blacklist",
  moderatorNotes?: string
) {
  // Check if user is an admin
  const adminUser = await prisma.admin.findUnique({
    where: { id: adminId },
  });
  if (!adminUser) throw new Error("User is not authorized as an admin");
  
  const deal = await prisma.dealLifecycle.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error("Deal not found");
  if (!deal.isEscalated) throw new Error("This deal is not escalated");

  const updateData: any = {
    adminAction: action,
    moderatorNotes,
    isEscalated: false,
    resolvedById: adminId,
    lastUpdated: new Date(),
  };

  // If action is resolved, update stage to OFFER_CONFIRMED
  if (action === "resolved") {
    updateData.stage = "OFFER_CONFIRMED";
  }

  if (action === "dropped") {
    updateData.stage = "CLOSED_NOT_PROCEEDING";
  }

  return prisma.dealLifecycle.update({
    where: { id: dealId },
    data: updateData,
  });
}

