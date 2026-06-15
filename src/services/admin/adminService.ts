import { prisma } from "../../config/database";
import bcrypt from "bcryptjs";
import { UserStatus, Role, AdminRole, Mode, PostStatus } from "@prisma/client";
import { encryptDocumentUrl } from "../../utils/cryptoUtils";

interface CreateAdminInput {
  fullName: string;
  email: string;
  password: string;
  companyName: string;
  secret: string;
}

// creating the admin with the secret key
export const createAdmin = async (data: CreateAdminInput) => {
  const { fullName, email, password, companyName, secret } = data;

  if (secret !== process.env.ADMIN_SECRET_KEY) {
    throw new Error("Forbidden");
  }

  const existingAdmin = await prisma.admin.findUnique({ where: { email } });
  if (existingAdmin) {
    throw new Error("Admin already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const admin = await prisma.admin.create({
    data: {
      fullName,
      email,
      password: hashedPassword,
      companyName,
      role: Role.ADMIN,
      adminRole: AdminRole.SUPER_ADMIN,
      status: UserStatus.APPROVED,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      companyName: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  return admin;
};



// Fetch users with PENDING status
export const getPendingUsers = async () => {
  return prisma.user.findMany({
    where: { status: UserStatus.PENDING },
  });
};

// Get all users + approved list + rejected list
export const getAllUsers = async () => {
  const [allUsers, approvedUsers, rejectedUsers] = await Promise.all([
    prisma.user.findMany(),
    prisma.user.findMany({ where: { status: UserStatus.APPROVED } }),
    prisma.user.findMany({ where: { status: UserStatus.REJECTED } }),
  ]);

  return {
    allUsers,
    approvedUsers,
    rejectedUsers,
  };
};





// Update user status (APPROVED or REJECTED)
export const updateUserStatus = async (userId: string, status: UserStatus) => {
  return prisma.user.update({
    where: { id: userId },
    data: { status },
  });
};

// Get user by email (for admin lookup)
export const getUserByEmail = async (email: string) => {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    include: {
      Subscription: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          plan: true,
        },
      },
    },
  });
  return user;
};

// Get user by ID (for admin)
export const getUserById = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      Subscription: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          plan: true,
        },
      },
    },
  });
  return user;
};

// Admin update user with full access to all fields
export const adminUpdateUser = async (userId: string, updateData: any) => {
  // Only exclude the immutable fields
  const { _id, id, password, createdAt, ...allowedUpdates } = updateData;

  const data: any = { ...allowedUpdates };

  if (updateData.dateOfIncorporation !== undefined) {
    if (updateData.dateOfIncorporation === null || updateData.dateOfIncorporation === "") {
      data.dateOfIncorporation = null;
    } else {
      const d = new Date(updateData.dateOfIncorporation);
      if (Number.isNaN(d.getTime())) {
        throw new Error("Invalid dateOfIncorporation. Use ISO date like 2026-04-01.");
      }
      data.dateOfIncorporation = d;
    }
  }

  // Encrypt document URLs if the admin provided new ones
  const documentFields = ["panDocumentUrl", "cinDocumentUrl", "gstDocumentUrl"];
  for (const field of documentFields) {
    if (data[field] && !data[field].startsWith("ENC:")) {
      data[field] = encryptDocumentUrl(data[field]);
    }
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data,
  });

  return updatedUser;
};

// Suspend user for malicious activities
export const suspendUser = async (userId: string, reason: string) => {
  // First get the current status to save it
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      previousStatus: currentUser?.status, // Save current status before suspension
      status: UserStatus.SUSPENDED,
      rejectionReason: reason, // reuse rejectionReason field for suspension reason
    },
  });
  return user;
};

// Get provider posts (jobs) with filtering, sorting, and pagination
export const getProviderPosts = async (
  page: number = 1,
  limit: number = 10,
  status?: string,
  search?: string
) => {
  const skip = (page - 1) * limit;
  const normalizedStatus = status?.toUpperCase() as PostStatus;

  const where: any = {};

  if (normalizedStatus && Object.values(PostStatus).includes(normalizedStatus)) {
    where.status = normalizedStatus;
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { role: { contains: search, mode: "insensitive" } },
    ];
  }

  const [posts, total] = await Promise.all([
    prisma.providerPost.findMany({
      where,
      skip,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            companyName: true,
            profilePicture: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.providerPost.count({ where }),
  ]);

  return {
    posts,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

// Get seeker posts (jobs) with filtering, sorting, and pagination
export const getSeekerPosts = async (
  page: number = 1,
  limit: number = 10,
  status?: string,
  search?: string
) => {
  const skip = (page - 1) * limit;
  const normalizedStatus = status?.toUpperCase() as PostStatus;

  const where: any = {};

  if (normalizedStatus && Object.values(PostStatus).includes(normalizedStatus)) {
    where.status = normalizedStatus;
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { role: { contains: search, mode: "insensitive" } },
    ];
  }

  const [posts, total] = await Promise.all([
    prisma.seekerPost.findMany({
      where,
      skip,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            companyName: true,
            profilePicture: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.seekerPost.count({ where }),
  ]);

  return {
    posts,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

// Unsuspend user - restore to previous status
export const unsuspendUser = async (userId: string) => {
  // Get the previous status
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { previousStatus: true },
  });

  // Restore to previous status, default to APPROVED if no previous status
  const restoredStatus = currentUser?.previousStatus || UserStatus.APPROVED;

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      status: restoredStatus,
      previousStatus: null, // Clear the previous status
      rejectionReason: "",
    },
  });
  return user;
};

// Get user's post statistics (for admin)
export const getUserPostStats = async (userId: string) => {
  const [providerPosts, seekerPosts] = await Promise.all([
    prisma.providerPost.findMany({
      where: { userId },
      select: { status: true },
    }),
    prisma.seekerPost.findMany({
      where: { userId },
      select: { status: true },
    }),
  ]);

  const stats = {
    provider: {
      total: providerPosts.length,
      active: providerPosts.filter((p) => p.status === PostStatus.ACTIVE).length,
      inactive: providerPosts.filter((p) => p.status !== PostStatus.ACTIVE).length,
    },
    seeker: {
      total: seekerPosts.length,
      active: seekerPosts.filter((p) => p.status === PostStatus.ACTIVE).length,
      inactive: seekerPosts.filter((p) => p.status !== PostStatus.ACTIVE).length,
    },
  };

  return stats;
};

