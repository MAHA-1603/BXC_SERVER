import { prisma } from "../../config/database";
import { encryptDocumentUrl } from "../../utils/cryptoUtils";
import { Country } from "@prisma/client";

export const getMyProfileService = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      Subscription: {
        orderBy: { createdAt: "desc" },
        take: 1, // Only latest subscription
        include: {
          plan: true,
          Payment: {
            orderBy: { createdAt: "desc" },
            take: 1, // Only latest payment per subscription
          },
        },
      },
    },
  });
  return user;
};

export async function getAddOnSummary(userId: string) {
  const now = new Date();

  const allPurchases = await prisma.addOnPurchase.findMany({
    where: { userId },
    include: {
      addon: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const activeAddOns = allPurchases.filter((p) => {
    // Assuming a default 30-day window since expiryDate was removed from schema
    const expiryDate = new Date(p.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    return expiryDate >= now && p.status === "PAID";
  });

  const pastAddOns = allPurchases.filter((p) => {
    const expiryDate = new Date(p.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    return expiryDate < now || p.status !== "PAID";
  });

  return { activeAddOns, pastAddOns };
}

// Update user profile
export const updateProfileService = async (userId: string, updateData: any) => {
  // Define only the fields that are allowed to be updated by the user
  const validFields = [
    "fullName",
    "email",
    "phone",
    "companyName",
    "country",
    "industry",
    "industryFocus",
    "profilePicture",
    "panDocumentUrl",
    "cinDocumentUrl",
    "gstDocumentUrl",
    "location",
    "bio",
    "website",
    "websiteUrl",
    "isFounder",
    "city",
    "state",
    "pincode",
    "businessAddress",
    "registeredAddress",
    "gstNumber",
    "panNumber",
    "cinNumber",
    "dateOfIncorporation",
    "contactInfo",
    "typeOfEntity",
    "number",
    "mode"
  ];

  const allowedUpdates: any = {};

  // Only copy valid fields from the request
  for (const field of validFields) {
    if (updateData[field] !== undefined) {
      // Map aliases to schema names if necessary
      if (field === "website" && !updateData.websiteUrl) {
        allowedUpdates.websiteUrl = updateData.website;
      } else if (field === "industry" && !updateData.industryFocus) {
        allowedUpdates.industryFocus = updateData.industry;
      } else if (field === "number" && !updateData.phone) {
        allowedUpdates.phone = updateData.number;
      } else {
        allowedUpdates[field] = updateData[field];
      }
    }
  }

  // ✅ Normalization: Map country to Plan Enum (INDIA or INTERNATIONAL)
  if (allowedUpdates.country) {
    const countryStr = allowedUpdates.country.toUpperCase().trim();
    if (countryStr === "INDIA" || countryStr === "IN") {
      allowedUpdates.country = "INDIA";
    }
    // Note: We no longer force other countries to "INTERNATIONAL" here 
    // to allow users to save their actual country name (e.g. "USA", "Singapore").
    // The plan filtering logic will handle non-INDIA values as INTERNATIONAL.
  }

  // ✅ Normalization: Mode validation
  if (allowedUpdates.mode) {
    const modeStr = allowedUpdates.mode.toUpperCase().trim();
    if (modeStr === "PROVIDER" || modeStr === "SEEKER") {
      allowedUpdates.mode = modeStr;
    } else {
      delete allowedUpdates.mode; // Remove if invalid
    }
  }

  // Encrypt document URLs if provided
  const documentFields = ["panDocumentUrl", "cinDocumentUrl", "gstDocumentUrl"];
  for (const field of documentFields) {
    if (allowedUpdates[field] && !allowedUpdates[field].startsWith("ENC:")) {
      allowedUpdates[field] = encryptDocumentUrl(allowedUpdates[field]);
    }
  }

  // Update user using Prisma
  const user = await prisma.user.update({
    where: { id: userId },
    data: allowedUpdates,
  });

  return user;
};
