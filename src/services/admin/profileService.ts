import { prisma } from "../../config/database";


// Get admin profile
export const getAdminProfile = async (adminId: string) => {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
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

  if (!admin) {
    throw new Error("Admin not found");
  }

  return admin;
};

// Update admin profile
export const updateAdminProfile = async (adminId: string, updateData: any) => {
  // Remove restricted fields
  const { password, id, role, status, ...allowedUpdates } = updateData;

  const updatedAdmin = await prisma.admin.update({
    where: { id: adminId },
    data: allowedUpdates,
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

  return updatedAdmin;
};
