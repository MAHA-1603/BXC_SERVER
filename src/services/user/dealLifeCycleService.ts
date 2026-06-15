import { prisma } from "../../config/database";
import { DealStage, ApplicationStatus } from "@prisma/client";
import { sendEmail } from "../../utils/email";
import { createNotification } from "../notification/userNotificationService";

// Fire-and-forget email
function fireAndForgetEmail(to: string, subject: string, text: string) {
  sendEmail(to, subject, text).catch((err) => console.error("Email failed:", err));
}

// Fire-and-forget notification
function fireAndForgetNotification(
  userId: string, 
  title: string, 
  message: string, 
  type: string,
  navigationData?: Record<string, string>
) {
  createNotification(userId, title, message, type, navigationData).catch((err) => console.error("Notification failed:", err));
}

// Offer deal to applicant
export async function offerDeal(applicationId: string, ownerId: string) {
  return prisma.$transaction(async (tx) => {
    const app = await tx.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        applicantId: true,
        providerPost: { select: { userId: true, title: true } },
        seekerPost: { select: { userId: true, title: true } },
        applicant: { select: { id: true, email: true, companyName: true } },
      },
    });
    if (!app) throw new Error("Application not found");

    const isOwner =
      (app.providerPost && app.providerPost.userId === ownerId) ||
      (app.seekerPost && app.seekerPost.userId === ownerId);
    if (!isOwner) throw new Error("Not authorized to offer deal");

    const updated = await tx.application.update({
      where: { id: applicationId },
      data: { status: ApplicationStatus.PENDING_CONFIRMATION },
    });

    // non-blocking email & notification
    const applicantEmail = app.applicant?.email;
    const postTitle = app.providerPost?.title ?? app.seekerPost?.title ?? "your post";
    if (applicantEmail && app.applicant) {
      fireAndForgetEmail(
        applicantEmail,
        "You have received a deal offer",
        `You have received a deal offer for "${postTitle}". Please review and confirm or reject the offer.`
      );
      // Applicant receives offer - their mode is opposite of post type
      const preferredMode = app.providerPost ? "SEEKER" : "PROVIDER";
      const postType = app.providerPost ? "PROVIDER" : "SEEKER";
      fireAndForgetNotification(
        app.applicant.id,
        "New Deal Offer Received",
        `You have received a deal offer for "${postTitle}". Please review and respond.`,
        "DEAL_OFFER",
        {
          pageCode: "APPLICATION",
          preferredMode,
          applicationId,
          postType
        }
      );
    }

    return updated;
  });
}

// Confirm deal
export async function confirmDeal(applicationId: string, applicantId: string) {
  return prisma.$transaction(async (tx) => {
    const app = await tx.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        applicantId: true,
        status: true,
        providerPostId: true,
        seekerPostId: true,
        providerPost: {
          select: {
            userId: true,
            title: true,
            user: { select: { id: true, email: true, companyName: true } },
          },
        },
        seekerPost: {
          select: {
            userId: true,
            title: true,
            user: { select: { id: true, email: true, companyName: true } },
          },
        },
        applicant: { select: { id: true, companyName: true } },
      },
    });
    if (!app) throw new Error("Application not found");
    if (app.applicantId !== applicantId) throw new Error("Not authorized");

    if (app.status !== ApplicationStatus.PENDING_CONFIRMATION)
      throw new Error("No offer to confirm.");

    const deal = await tx.dealLifecycle.create({
      data: {
        applicationId,
        stage: DealStage.OFFER_CONFIRMED,
        nextActionDue: null,
      },
    });

    await tx.application.update({
      where: { id: applicationId },
      data: { status: ApplicationStatus.APPROVED },
    });

    // Update post status to FILLED when deal is confirmed
    if (app.providerPostId) {
      await tx.providerPost.update({
        where: { id: app.providerPostId },
        data: { status: "FILLED" },
      });
    } else if (app.seekerPostId) {
      await tx.seekerPost.update({
        where: { id: app.seekerPostId },
        data: { status: "FILLED" },
      });
    }

    // Get owner info from the already-fetched post data (no extra query!)
    const owner = app.providerPost?.user ?? app.seekerPost?.user;
    const postTitle = app.providerPost?.title ?? app.seekerPost?.title ?? "your post";
    
    if (owner?.email) {
      const ownerName = owner.companyName?.trim() ?? "User";
      const applicantName = app.applicant?.companyName ?? "the applicant";
      fireAndForgetEmail(
        owner.email,
        "Deal Confirmed",
        `Hello ${ownerName},\n\nYour deal offer for "${postTitle}" has been confirmed by ${applicantName}.\n\nThank you for using BenchXchange.`
      );
      // Owner receives confirmation - their mode matches post type
      const preferredMode = app.providerPost ? "PROVIDER" : "SEEKER";
      const postType = app.providerPost ? "PROVIDER" : "SEEKER";
      fireAndForgetNotification(
        owner.id,
        "Deal Confirmed",
        `Your deal offer for "${postTitle}" has been confirmed by ${applicantName}.`,
        "DEAL_CONFIRMED",
        {
          pageCode: "DEAL",
          preferredMode,
          applicationId,
          dealId: deal.id,
          postType
        }
      );
    }

    return deal;
  });
}

// Reject deal offer
export async function rejectDealOffer(applicationId: string, applicantId: string) {
  return prisma.$transaction(async (tx) => {
    const app = await tx.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        applicantId: true,
        status: true,
        providerPost: {
          select: {
            userId: true,
            title: true,
            user: { select: { id: true, email: true, companyName: true } },
          },
        },
        seekerPost: {
          select: {
            userId: true,
            title: true,
            user: { select: { id: true, email: true, companyName: true } },
          },
        },
        applicant: { select: { id: true, companyName: true } },
      },
    });
    if (!app) throw new Error("Application not found");
    if (app.applicantId !== applicantId) throw new Error("Not authorized");

    if (app.status !== ApplicationStatus.PENDING_CONFIRMATION)
      throw new Error("No offer to reject.");

    const updated = await tx.application.update({
      where: { id: applicationId },
      data: { status: ApplicationStatus.REJECTED },
    });

    // Get owner info from the already-fetched post data (no extra query!)
    const owner = app.providerPost?.user ?? app.seekerPost?.user;
    const postTitle = app.providerPost?.title ?? app.seekerPost?.title ?? "your post";

    if (owner?.email) {
      const ownerName = owner.companyName?.trim() ?? "User";
      const applicantName = app.applicant?.companyName ?? "the applicant";
      fireAndForgetEmail(
        owner.email,
        "Deal Offer Rejected",
        `Hello ${ownerName},\n\nYour deal offer for "${postTitle}" has been rejected by ${applicantName}.\n\nThank you for using BenchXchange.`
      );
      // Owner receives rejection - their mode matches post type
      const preferredMode = app.providerPost ? "PROVIDER" : "SEEKER";
      const postType = app.providerPost ? "PROVIDER" : "SEEKER";
      fireAndForgetNotification(
        owner.id,
        "Deal Offer Rejected",
        `Your deal offer for "${postTitle}" has been rejected by ${applicantName}.`,
        "DEAL_REJECTED",
        {
          pageCode: "APPLICATION",
          preferredMode,
          applicationId,
          postType
        }
      );
    }

    return updated;
  });
}

// Cancel deal offer
export async function cancelOffer(applicationId: string, ownerId: string) {
  return prisma.$transaction(async (tx) => {
    const app = await tx.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        status: true,
        providerPost: { select: { userId: true, title: true } },
        seekerPost: { select: { userId: true, title: true } },
        applicant: { select: { id: true, email: true, companyName: true } },
      },
    });
    if (!app) throw new Error("Application not found");

    const isOwner =
      (app.providerPost && app.providerPost.userId === ownerId) ||
      (app.seekerPost && app.seekerPost.userId === ownerId);
    if (!isOwner) throw new Error("Not authorized");

    if (app.status !== ApplicationStatus.PENDING_CONFIRMATION)
      throw new Error("No offer to cancel.");

    const updated = await tx.application.update({
      where: { id: applicationId },
      data: { status: ApplicationStatus.REJECTED },
    });

    if (app.applicant?.email) {
      const postTitle = app.providerPost?.title ?? app.seekerPost?.title ?? "a post";
      const applicantName = app.applicant.companyName?.trim() ?? "User";

      fireAndForgetEmail(
        app.applicant.email,
        "Deal Offer Cancelled",
        `Hello ${applicantName},\n\nThe deal offer for "${postTitle}" has been cancelled by the owner.\n\nThank you for using BenchXchange.`
      );
      // Applicant receives cancellation - their mode is opposite of post type
      const preferredMode = app.providerPost ? "SEEKER" : "PROVIDER";
      const postType = app.providerPost ? "PROVIDER" : "SEEKER";
      fireAndForgetNotification(
        app.applicant.id,
        "Deal Offer Cancelled",
        `The deal offer for "${postTitle}" has been cancelled by the owner.`,
        "DEAL_CANCELLED",
        {
          pageCode: "APPLICATION",
          preferredMode,
          applicationId,
          postType
        }
      );
    }

    return updated;
  });
}

// Allowed deal stages
const ALLOWED_DEAL_STAGES: DealStage[] = [
  "CLOSED_SUCCESSFUL",
  "CLOSED_NOT_PROCEEDING",
  "STUCK_NEEDS_REVIEW",
];

// Update deal stage safely
export async function updateDealStage(dealId: string, newStage: DealStage, reason?: string) {
  if (!ALLOWED_DEAL_STAGES.includes(newStage)) {
    throw new Error(`Allowed stages: ${ALLOWED_DEAL_STAGES.join(", ")}`);
  }

  const now = new Date();
  const nextActionDue = newStage === "STUCK_NEEDS_REVIEW" ? now : null;

  return prisma.dealLifecycle.update({
    where: { id: dealId },
    data: { stage: newStage, reason, lastUpdated: now, nextActionDue },
  });
}

// Escalate deal safely
export async function escalateDeal(
  dealId: string,
  escalatedById: string,
  issueCategory: string,
  moderatorNotes?: string
) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const deal = await tx.dealLifecycle.findUnique({ 
      where: { id: dealId },
      select: { id: true, stage: true, adminAction: true }
    });
    if (!deal) throw new Error("Deal not found");
    if (deal.stage === "CLOSED_SUCCESSFUL" || deal.adminAction === "resolved")
      throw new Error("Cannot escalate closed deal");

    const admin = await tx.admin.findFirst({
      where: { status: "APPROVED" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!admin) throw new Error("No available admin found");

    await tx.dealLifecycle.update({
      where: { id: dealId },
      data: { isEscalated: true, issueCategory, moderatorNotes, escalatedBy: escalatedById, lastUpdated: now },
    });

    let conversation = await tx.escalationConversation.findUnique({ where: { dealLifecycleId: dealId } });
    if (!conversation) {
      conversation = await tx.escalationConversation.create({
        data: { dealLifecycleId: dealId, escalatedById, adminId: admin.id, createdAt: now, updatedAt: now },
      });
    }

    // Get admins for notifications
    const admins = await tx.admin.findMany({
      where: { status: "APPROVED" },
      select: { id: true, email: true, fullName: true },
    });

    const escalator = await tx.user.findUnique({ 
      where: { id: escalatedById }, 
      select: { companyName: true } 
    });
    const message = `${escalator?.companyName ?? "A user"} has escalated a deal issue. Category: ${issueCategory}`;

    for (const adminUser of admins) {
      fireAndForgetNotification(
        adminUser.id, 
        "New Deal Escalation", 
        message, 
        "DEAL_ESCALATED",
        {
          pageCode: "ESCALATION",
          dealId
        }
      );
      if (adminUser.email) {
        fireAndForgetEmail(
          adminUser.email, 
          "New Deal Escalation", 
          `Hello ${adminUser.fullName ?? "Admin"},\n\n${message}.\n\nPlease review.`
        );
      }
    }

    return conversation;
  });
}
