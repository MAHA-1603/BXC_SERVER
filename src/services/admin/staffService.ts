import { prisma } from "../../config/database";
import bcrypt from "bcryptjs";
import { AdminRole, Role, UserStatus } from "@prisma/client";

interface CreateStaffInput {
  fullName: string;
  email: string;
  password: string;
  adminRole: AdminRole;
  permissions: string[];
}

export const createStaffMember = async (data: CreateStaffInput) => {
  const { fullName, email, password, adminRole, permissions } = data;

  const existingAdmin = await prisma.admin.findUnique({ where: { email } });
  if (existingAdmin) {
    throw new Error("Staff member with this email already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newStaff = await prisma.admin.create({
    data: {
      fullName,
      email,
      password: hashedPassword,
      adminRole,
      permissions,
      companyName: "BXC",
      role: Role.ADMIN,
      status: UserStatus.APPROVED,
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      adminRole: true,
      permissions: true,
      status: true,
      createdAt: true,
    },
  });

  return newStaff;
};

export const getAllStaffMembers = async () => {
  return prisma.admin.findMany({
    select: {
      id: true,
      fullName: true,
      email: true,
      adminRole: true,
      permissions: true,
      status: true,
      createdAt: true,
    },
  });
};

interface UpdateStaffInput {
  adminRole?: AdminRole;
  permissions?: string[];
}

export const updateStaffMember = async (staffId: string, data: UpdateStaffInput) => {
  return prisma.admin.update({
    where: { id: staffId },
    data,
    select: {
      id: true,
      fullName: true,
      email: true,
      adminRole: true,
      permissions: true,
      status: true,
      createdAt: true,
    },
  });
};

export const deleteStaffMember = async (staffId: string) => {
  return prisma.admin.delete({
    where: { id: staffId },
  });
};
