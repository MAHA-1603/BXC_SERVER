import { prisma } from "../../config/database";
import { Country, PaymentCurrency } from "@prisma/client";

function calculateGST(basePrice: number, gstPercentage: number) {
  // Assuming basePrice is in smallest currency unit (paise/cents)
  const gstAmount = Math.round((basePrice * gstPercentage) / 100);
  const price = basePrice + gstAmount;
  return { gstAmount, price };
}

export async function createAddon(data: {
  name?: string;
  title: string;
  description: string;
  type: any;
  category: any;
  jobPostingLimit: number;
  profilesAllowed: number;
  hasVerification?: boolean;
  hasPriorityTag?: boolean;
  variant?: string;
  countryPricings: {
    countryCode: string;
    currency: string;
    basePrice?: number;
    gstPercentage?: number;
    totalPrice: number;
  }[];
}) {
  const {
    name,
    title,
    description,
    type,
    category,
    jobPostingLimit,
    profilesAllowed,
    hasVerification = false,
    hasPriorityTag = false,
    variant,
    countryPricings,
  } = data;

  const results = [];

  for (const pricing of countryPricings) {
    const countryRaw = pricing.countryCode || "";
    const isIndia = countryRaw.toUpperCase() === "IN" || countryRaw.toUpperCase() === "INDIA";
    const country = isIndia ? Country.INDIA : Country.INTERNATIONAL;

    const basePrice = pricing.basePrice || pricing.totalPrice;
    const gstPercentage = pricing.gstPercentage || 0;
    const { gstAmount, price } = calculateGST(basePrice, gstPercentage);

    const currency = isIndia ? "INR" : "USD";

    const addon = await prisma.addOn.create({
      data: {
        name,
        title,
        description,
        type,
        category,
        jobPostingLimit,
        profilesAllowed,
        hasVerification,
        hasPriorityTag,
        variant,
        countryCode: country,
        currency: currency as PaymentCurrency,
        basePrice,
        gstPercentage,
        gstAmount,
        price,
      },
    });
    results.push(addon);
  }

  return results;
}

export async function updateAddOn(id: string, data: any) {
  let { basePrice, gstPercentage, totalPrice, countryCode, currency, ...rest } = data;
  let updateData: any = { ...rest };

  // Handle price and GST if basePrice, gstPercentage, or totalPrice is updated
  if (basePrice !== undefined || gstPercentage !== undefined || totalPrice !== undefined) {
    const currentAddon = await prisma.addOn.findUnique({ where: { id } });
    if (!currentAddon) throw new Error("Add-on not found");

    const effectiveBase = basePrice ?? totalPrice ?? currentAddon.basePrice ?? 0;
    const effectiveGST = gstPercentage ?? currentAddon.gstPercentage ?? 0;

    const { gstAmount, price } = calculateGST(effectiveBase, effectiveGST);
    updateData.basePrice = effectiveBase;
    updateData.gstPercentage = effectiveGST;
    updateData.gstAmount = gstAmount;
    updateData.price = price;
  }

  // Handle countryCode mapping and auto-derive currency
  if (countryCode) {
    const isIndia = countryCode.toUpperCase() === "IN" || countryCode.toUpperCase() === "INDIA";
    updateData.countryCode = isIndia ? Country.INDIA : Country.INTERNATIONAL;
    // Auto-sync currency if country changes
    updateData.currency = isIndia ? PaymentCurrency.INR : PaymentCurrency.USD;
  } else if (currency) {
    // If only currency is provided, ensure it's valid for the existing country
    const currentAddon = await prisma.addOn.findUnique({ where: { id } });
    if (currentAddon) {
      const isInternational = currentAddon.countryCode === Country.INTERNATIONAL;
      const targetCurrency = currency.toUpperCase();
      
      if (isInternational && targetCurrency !== "USD") {
        updateData.currency = PaymentCurrency.USD;
      } else if (!isInternational && targetCurrency !== "INR") {
        updateData.currency = PaymentCurrency.INR;
      } else {
        updateData.currency = targetCurrency;
      }
    }
  }

  return await prisma.addOn.update({
    where: { id },
    data: updateData,
  });
}

export async function deleteAddon(id: string) {
  const purchaseCount = await prisma.addOnPurchase.count({
    where: { addonId: id },
  });

  if (purchaseCount > 0) {
    throw new Error(
      `Cannot delete this add-on because ${purchaseCount} purchase(s) are linked to it.`
    );
  }

  return await prisma.addOn.delete({
    where: { id },
  });
}

export async function getAddons(country?: Country) {
  const whereClause = country ? { countryCode: country } : {};
  const addons = await prisma.addOn.findMany({
    where: whereClause,
  });
  // Ensure every addon has a currency field (backward compatibility if missing in DB)
  return addons.map(addon => ({
    ...addon,
    currency: addon.currency || (addon.countryCode === Country.INDIA ? "INR" : "USD")
  }));
}
