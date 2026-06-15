import { prisma } from "../../config/database";
import { sendEmail } from "../../utils/email";
import { createNotification } from "../notification/userNotificationService";

export async function createApplication(
  applicantId: string,
  postId: string,
  postType: "PROVIDER" | "SEEKER",
  message?: string
) {
  return prisma.$transaction(async (tx) => {
    if (postType === "PROVIDER") {
      // validate provider post
      const providerPost = await tx.providerPost.findUnique({
        where: { id: postId },
        select: { id: true, userId: true },
      });
      if (!providerPost) throw new Error("Provider post not found");

      // prevent applying to own post
      if (providerPost.userId === applicantId)
        throw new Error("You cannot apply to your own provider post");

      // only 1 approved application allowed
      const approved = await tx.application.findFirst({
        where: { providerPostId: postId, status: "APPROVED" },
      });
      if (approved)
        throw new Error("This provider post already has an approved application");

      // prevent duplicate application
      const existing = await tx.application.findFirst({
        where: { applicantId, providerPostId: postId },
      });
      if (existing)
        throw new Error("Already applied to this provider post");

      return tx.application.create({
        data: {
          applicantId,
          providerPostId: postId,
          message,
        },
      });
    }

    // seeker post flow
    const seekerPost = await tx.seekerPost.findUnique({
      where: { id: postId },
      select: { id: true, userId: true },
    });
    if (!seekerPost) throw new Error("Seeker post not found");

    if (seekerPost.userId === applicantId)
      throw new Error("You cannot apply to your own seeker post");

    const approved = await tx.application.findFirst({
      where: { seekerPostId: postId, status: "APPROVED" },
    });
    if (approved)
      throw new Error("This seeker post already has an approved application");

    const existing = await tx.application.findFirst({
      where: { applicantId, seekerPostId: postId },
    });
    if (existing)
      throw new Error("Already applied to this seeker post");

    return tx.application.create({
      data: {
        applicantId,
        seekerPostId: postId,
        message,
      },
    });
  });
}


// Apply to provider post
function fireAndForgetEmail(
  to: string,
  subject: string,
  text: string,
  html?: string
) {
  sendEmail(to, subject, text, html).catch((err) => {
    console.error("sendEmail failed (non-blocking):", err);
  });
}

/**
 * Apply to provider post
 */
export async function applyToProviderPost(
  applicantId: string,
  providerPostId: string,
  message?: string
) {
  try {
    const application = await prisma.$transaction(async (tx) => {
      // 1) load providerPost basic info + owner
      const providerPost = await tx.providerPost.findUnique({
        where: { id: providerPostId },
        select: {
          id: true,
          title: true,
          status: true,
          userId: true,
          user: { select: { id: true, email: true } },
        },
      });
      if (!providerPost) throw new Error("Provider post not found");

      // prevent applying to filled post
      if (providerPost.status === "FILLED") {
        throw new Error("This post is no longer accepting applications");
      }

      // prevent self-apply
      if (providerPost.userId === applicantId) {
        throw new Error("You cannot apply to your own provider post");
      }

      // 2) load applicant user profile remaining info
      const user = await tx.user.findUnique({
        where: { id: applicantId },
        select: { id: true, combinedProfilesRemaining: true, companyName: true },
      });
      if (!user) throw new Error("Applicant not found");

      // 3) subscription & addons
      const subscription = await tx.subscription.findFirst({
        where: { userId: applicantId, status: "ACTIVE" },
        select: { id: true, profilesRemaining: true, totalProfilesUsed: true, isUnlimitedProfiles: true },
        orderBy: { createdAt: "desc" },
      });
      if (!subscription) throw new Error("No active subscription found");

      const totalProfilesAvailable = (subscription.profilesRemaining ?? 0) + (user.combinedProfilesRemaining ?? 0);
      const isUnlimited = subscription.isUnlimitedProfiles || false;

      if (!isUnlimited && totalProfilesAvailable <= 0) {
        throw new Error("Your profile application limit has been reached.");
      }

      // AddOnPurchases are no longer tracked for local profilesRemaining limits.
      // We rely completely on the global user.combinedProfilesRemaining check above.

      // 4) check post-level approved application inside tx
      const approvedApp = await tx.application.findFirst({
        where: { providerPostId, status: "APPROVED" },
      });
      if (approvedApp) {
        throw new Error("This provider post already has an approved application");
      }

      // 5) check duplicate application (allow re-apply if previously REJECTED)
      const existing = await tx.application.findFirst({
        where: {
          applicantId,
          providerPostId,
          status: { not: "REJECTED" }, // allow re-apply after rejection
        },
      });
      if (existing) throw new Error("Already applied to this provider post");

      // 6) create application
      const app = await tx.application.create({
        data: { applicantId, providerPostId, message },
      });

      // 7) Decrement profiles using layered logic
      if (isUnlimited) {
        // Layer 0: Unlimited — skip decrement, only track usage
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            totalProfilesUsed: { increment: 1 },
          },
        });
      } else if ((subscription.profilesRemaining ?? 0) > 0) {
        // Layer 1: Use Plan Allotment
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            totalProfilesUsed: { increment: 1 },
            profilesRemaining: { decrement: 1 },
          },
        });
      } else {
        // Layer 2: Use Addon Balance
        await tx.user.update({
          where: { id: applicantId },
          data: {
            combinedProfilesRemaining: { decrement: 1 },
          },
        });
      }

      // Always increment global total used
      await tx.user.update({
        where: { id: applicantId },
        data: {
          combinedTotalProfilesUsed: { increment: 1 },
        },
      });

      return { app, providerPost, applicantCompanyName: user.companyName ?? "" };
    }); // end transaction

    // NOT BLOCKING: send email & notification after transaction completes
    if (application.providerPost.user?.email) {
      fireAndForgetEmail(
        application.providerPost.user.email,
        "New Application Received for Your Provider Post",
        `Your provider post "${application.providerPost.title}" has a new application from company: ${application.applicantCompanyName}.`,
        `<p>Your provider post "<strong>${application.providerPost.title}</strong>" has a new application from company: <strong>${application.applicantCompanyName}</strong>.</p>`
      );
    }

    // create notification (awaiting is fine here; small DB write)
    if (application.providerPost.user?.id) {
      await createNotification(
        application.providerPost.user.id,
        "New Application Received",
        `Your provider post ${application.providerPost.title} has a new application from company: ${application.applicantCompanyName}.`,
        "APPLICATION",
        {
          pageCode: "APPLICATION",
          preferredMode: "PROVIDER",
          applicationId: application.app.id,
          postType: "PROVIDER"
        }
      );
    }

    return application.app;
  } catch (err) {
    console.error("applyToProviderPost error:", err);

    // List of user-facing error messages that should be shown as-is
    const userFacingErrors = [
      "Provider post not found",
      "You cannot apply to your own provider post",
      "Applicant not found",
      "Your profile application limit has been reached.",
      "No active subscription found",
      "Your application limit has been reached. Please purchase an addon to continue applying.",
      "This provider post already has an approved application",
      "Already applied to this provider post",
      "This post is no longer accepting applications",
    ];

    // If it's a known user-facing error, re-throw it
    if (err instanceof Error && userFacingErrors.includes(err.message)) {
      throw err;
    }

    // For unexpected errors, throw a generic message
    throw new Error("Unable to process application at this time");
  }
}

/**
 * Apply to seeker post
 */
export async function applyToSeekerPost(
  applicantId: string,
  seekerPostId: string,
  message?: string
) {
  try {
    const application = await prisma.$transaction(async (tx) => {
      // 1) load seekerPost basic info + owner
      const seekerPost = await tx.seekerPost.findUnique({
        where: { id: seekerPostId },
        select: {
          id: true,
          title: true,
          status: true,
          userId: true,
          user: { select: { id: true, email: true } },
        },
      });
      if (!seekerPost) throw new Error("Seeker post not found");

      // prevent applying to filled post
      if (seekerPost.status === "FILLED") {
        throw new Error("This post is no longer accepting applications");
      }

      // prevent self-apply
      if (seekerPost.userId === applicantId) {
        throw new Error("You cannot apply to your own seeker post");
      }

      // 2) load applicant user profile remaining info
      const user = await tx.user.findUnique({
        where: { id: applicantId },
        select: { id: true, combinedProfilesRemaining: true, companyName: true },
      });
      if (!user) throw new Error("Applicant not found");

      // 3) subscription & addons
      const subscription = await tx.subscription.findFirst({
        where: { userId: applicantId, status: "ACTIVE" },
        select: { id: true, profilesRemaining: true, totalProfilesUsed: true, isUnlimitedProfiles: true },
        orderBy: { createdAt: "desc" },
      });
      if (!subscription) throw new Error("No active subscription found");

      const totalProfilesAvailable = (subscription.profilesRemaining ?? 0) + (user.combinedProfilesRemaining ?? 0);
      const isUnlimited = subscription.isUnlimitedProfiles || false;

      if (!isUnlimited && totalProfilesAvailable <= 0) {
        throw new Error("Your profile application limit has been reached.");
      }

      // AddOnPurchases are no longer tracked for local profilesRemaining limits.
      // We rely completely on the global user.combinedProfilesRemaining check above.

      // 4) check post-level approved application inside tx
      const approvedApp = await tx.application.findFirst({
        where: { seekerPostId, status: "APPROVED" },
      });
      if (approvedApp)
        throw new Error("This seeker post already has an approved application");

      // 5) check duplicate application (allow reapply if previously REJECTED)
      const existing = await tx.application.findFirst({
        where: {
          applicantId,
          seekerPostId,
          status: { not: "REJECTED" },
        },
      });
      if (existing) throw new Error("Already applied to this seeker post");

      // 6) create application
      const app = await tx.application.create({
        data: { applicantId, seekerPostId, message },
      });

      // 7) Decrement profiles using layered logic
      if (isUnlimited) {
        // Layer 0: Unlimited — skip decrement, only track usage
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            totalProfilesUsed: { increment: 1 },
          },
        });
      } else if ((subscription.profilesRemaining ?? 0) > 0) {
        // Layer 1: Use Plan Allotment
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            totalProfilesUsed: { increment: 1 },
            profilesRemaining: { decrement: 1 },
          },
        });
      } else {
        // Layer 2: Use Addon Balance
        await tx.user.update({
          where: { id: applicantId },
          data: {
            combinedProfilesRemaining: { decrement: 1 },
          },
        });
      }

      // Always increment global total used
      await tx.user.update({
        where: { id: applicantId },
        data: {
          combinedTotalProfilesUsed: { increment: 1 },
        },
      });

      return { app, seekerPost, applicantCompanyName: user.companyName ?? "" };
    });

    // NOT BLOCKING email
    if (application.seekerPost.user?.email) {
      fireAndForgetEmail(
        application.seekerPost.user.email,
        "New Application Received for Your Seeker Post",
        `Your seeker post "${application.seekerPost.title}" has a new application from company: ${application.applicantCompanyName}.`,
        `<p>Your seeker post "<strong>${application.seekerPost.title}</strong>" has a new application from company: <strong>${application.applicantCompanyName}</strong>.</p>`
      );
    }

    // create notification
    if (application.seekerPost.user?.id) {
      await createNotification(
        application.seekerPost.user.id,
        "New Application Received",
        `Your seeker post ${application.seekerPost.title} has a new application from company: ${application.applicantCompanyName}.`,
        "APPLICATION",
        {
          pageCode: "APPLICATION",
          preferredMode: "SEEKER",
          applicationId: application.app.id,
          postType: "SEEKER"
        }
      );
    }

    return application.app;
  } catch (err) {
    console.error("applyToSeekerPost error:", err);
    throw new Error("Unable to process application at this time");
  }
}




// Fetch all applications user has applied to Seeker posts (i.e. applications shown in Provider mode applied tab)
export async function getProviderAppliedApplications(userId: string) {
  const apps = await prisma.application.findMany({
    where: { applicantId: userId, seekerPostId: { not: null } },
    include: {
      seekerPost: {
        select: {
          id: true,
          title: true,
          imageUrl: true,
          description: true,
          requiredSkills: true,
          level: true,
          location: true,
          status: true,
          createdAt: true,
          // add other post fields you want to show
          Conversation: {
            select: { id: true },
          },
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              profilePicture: true,
              companyName: true,
            },
          },
        },
      },
      DealLifecycle: {
        select: {
          id: true,
          stage: true,
          lastUpdated: true,
          nextActionDue: true,
          isEscalated: true,
          escalatedBy: true,
          issueCategory: true,
          moderatorNotes: true,
          adminAction: true,
          escalationConversation: {
            select: { id: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // ⭐ Optimized grouping
  const grouped = apps.reduce((acc: Record<string, typeof apps>, a) => {
    if (!acc[a.status]) acc[a.status] = [];
    acc[a.status].push(a);
    return acc;
  }, {});


  return {
    pending: grouped.PENDING || [],
    pendingConfirmation: grouped.PENDING_CONFIRMATION || [],
    approved: grouped.APPROVED || [],
    rejected: grouped.REJECTED || [],
  };
}

export async function getProviderReceivedApplications(userId: string) {
  const apps = await prisma.application.findMany({
    where: {
      providerPostId: { not: null },
      providerPost: { userId },
    },
    include: {
      Conversation: {
        select: { id: true },
      },
      applicant: {
        select: {
          id: true,
          fullName: true,
          email: true,
          profilePicture: true,
          companyName: true,
        },
      },
      DealLifecycle: {
        select: {
          id: true,
          stage: true,
          lastUpdated: true,
          nextActionDue: true,
          isEscalated: true,
          escalatedBy: true,
          issueCategory: true,
          moderatorNotes: true,
          adminAction: true,
          escalationConversation: {
            select: { id: true },
          },
        },
      },
      providerPost: {
        select: {
          id: true,
          title: true,
          imageUrl: true,
          description: true,
          skillTags: true,
          level: true,
          location: true,
          status: true,
          createdAt: true,

          // add other post fields you want to show
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const grouped = apps.reduce((acc: Record<string, typeof apps>, a) => {
    if (!acc[a.status]) acc[a.status] = [];
    acc[a.status].push(a);
    return acc;
  }, {});


  return {
    pending: grouped.PENDING || [],
    pendingConfirmation: grouped.PENDING_CONFIRMATION || [],
    approved: grouped.APPROVED || [],
    rejected: grouped.REJECTED || [],
  };
}

// Fetch all applications user has applied to Provider posts (i.e. applications shown in Seeker mode applied tab)
export async function getSeekerAppliedApplications(userId: string) {
  const apps = await prisma.application.findMany({
    where: { applicantId: userId, providerPostId: { not: null } }, // Change filter here to providerPostId
    include: {
      Conversation: {
        select: { id: true },
      },
      applicant: {
        select: {
          id: true,
          fullName: true,
          email: true,
          profilePicture: true,
          companyName: true,
        },
      },
      DealLifecycle: {
        select: {
          id: true,
          stage: true,
          lastUpdated: true,
          nextActionDue: true,
          isEscalated: true,
          escalatedBy: true,
          issueCategory: true,
          moderatorNotes: true,
          adminAction: true,
          escalationConversation: {
            select: { id: true },
          },
        },
      },
      providerPost: {
        select: {
          id: true,
          title: true,
          imageUrl: true,
          description: true,
          skillTags: true,
          level: true,
          location: true,
          status: true,
          createdAt: true,
          // add other post fields you want to show
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const grouped = apps.reduce((acc: Record<string, typeof apps>, a) => {
    if (!acc[a.status]) acc[a.status] = [];
    acc[a.status].push(a);
    return acc;
  }, {});


  return {
    pending: grouped.PENDING || [],
    pendingConfirmation: grouped.PENDING_CONFIRMATION || [],
    approved: grouped.APPROVED || [],
    rejected: grouped.REJECTED || [],
  };
}

// Get all applications received on user's seeker posts, grouped by status
export async function getSeekerReceivedApplications(userId: string) {
  const apps = await prisma.application.findMany({
    where: {
      seekerPostId: { not: null },
      seekerPost: { userId },
    },
    include: {
      Conversation: {
        select: { id: true },
      },
      applicant: {
        select: {
          id: true,
          fullName: true,
          email: true,
          profilePicture: true,
          companyName: true,
        },
      },
      DealLifecycle: {
        select: {
          id: true,
          stage: true,
          lastUpdated: true,
          nextActionDue: true,
          isEscalated: true,
          escalatedBy: true,
          issueCategory: true,
          moderatorNotes: true,
          adminAction: true,
          escalationConversation: {
            select: { id: true },
          },
        },
      },
      seekerPost: {
        select: {
          id: true,
          title: true,
          imageUrl: true,
          description: true,
          requiredSkills: true,
          level: true,
          location: true,
          status: true,
          createdAt: true,
          // add other post fields you want to show
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const grouped = apps.reduce((acc: Record<string, typeof apps>, a) => {
    if (!acc[a.status]) acc[a.status] = [];
    acc[a.status].push(a);
    return acc;
  }, {});


  return {
    pending: grouped.PENDING || [],
    pendingConfirmation: grouped.PENDING_CONFIRMATION || [],
    approved: grouped.APPROVED || [],
    rejected: grouped.REJECTED || [],
  };
}

// Update application status (APPROVED/REJECTED)
export async function updateApplicationStatus(
  applicationId: string,
  userId: string,
  status: "APPROVED" | "REJECTED"
) {
  // Fetch application with necessary relations
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      providerPost: true,
      seekerPost: true,
      applicant: true,
    },
  });

  if (!app) throw new Error("Application not found");

  // Check ownership safely
  const isProviderOwner = app.providerPost?.userId === userId;
  const isSeekerOwner = app.seekerPost?.userId === userId;

  if (!isProviderOwner && !isSeekerOwner) throw new Error("Not authorized");

  // Run transaction to update application and create conversation if needed
  const updatedApplication = await prisma.$transaction(async (tx) => {
    // Update application status
    const updatedApp = await tx.application.update({
      where: { id: applicationId },
      data: { status },
    });

    // Check if conversation exists inside transaction
    const conversationExists = await tx.conversation.findUnique({
      where: { applicationId },
    });

    if (!conversationExists && status === "APPROVED") {
      const conversation = await tx.conversation.create({
        data: { applicationId },
      });

      // Link conversation to application
      await tx.application.update({
        where: { id: applicationId },
        data: { conversationId: conversation.id },
      });
    }

    return updatedApp;
  });

  // Safely send email and notification without breaking API
  const applicantEmail = app.applicant?.email;
  const applicantName = app.applicant?.companyName ?? "Applicant";
  const postTitle = app.providerPost?.title ?? app.seekerPost?.title ?? "your post";

  if (applicantEmail) {
    const subject = `Your application status has been updated to ${status}`;
    const text = `Hello ${applicantName},\n\nYour application for the post "${postTitle}" has been ${status}.\n\nThank you for using BenchXchange.`;
    // Fire-and-forget: Don't block API response waiting for email
    sendEmail(applicantEmail, subject, text).catch((err) => {
      console.error("Failed to send email:", err);
    });
  }

  if (app.applicant?.id) {
    try {
      const message = `Hello ${applicantName},\n\nYour application for the post "${postTitle}" has been ${status}.\n\nThank you for using BenchXchange.`;
      // Applicant's preferred mode is opposite of post type
      // If applied to provider post -> was in seeker mode
      // If applied to seeker post -> was in provider mode
      const preferredMode = app.providerPost ? "SEEKER" : "PROVIDER";
      const postType = app.providerPost ? "PROVIDER" : "SEEKER";

      await createNotification(
        app.applicant.id,
        "Application Status Updated",
        message,
        "APPLICATION",
        {
          pageCode: "APPLICATION",
          preferredMode,
          applicationId: app.id,
          postType
        }
      );
    } catch (err) {
      console.error("Failed to create notification:", err);
    }
  }

  return updatedApplication;
}


// Get application details by ID
export async function getApplicationById(applicationId: string) {
  return prisma.application.findUnique({
    where: { id: applicationId },
    include: { applicant: true, providerPost: true, seekerPost: true },
  });
}
