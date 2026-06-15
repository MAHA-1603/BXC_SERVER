// services/planService.ts
import { prisma } from "../../config/database";
import { razorpay } from "../../config/razorpay";
import { Country, PlanName } from "@prisma/client";

export const createPlanService = async (data: {
  name?: PlanName;
  title: string;
  description: string;
  duration?: number; // 1 for monthly, 12 for yearly etc.
  isFreePlan: boolean;
  freePostsPerMonth?: number;
  jobsAllowed?: number;
  profilesAllowed?: number;
  audience: string;
  benefits?: any;
  extraMonths?: number;
  hasVerification?: boolean;
  isUnlimitedJobs?: boolean;
  isUnlimitedProfiles?: boolean;
  founderCohortStartDate?: Date;
  founderCohortCutoff?: Date;
  founderDiscount?: number;
  founderExtensionDays?: number;
  founderFreeEndDate?: Date;
  trialPeriodDays?: number;
  countryPricings: {
    countryCode: string;
    currency: string;
    basePrice?: number;
    gstPercentage?: number;
    totalPrice: number; // Smallest unit: Paisa (INR) or Cents (USD)
  }[];
}) => {
  const {
    name,
    title,
    description,
    duration = 1,
    isFreePlan,
    freePostsPerMonth = 2,
    jobsAllowed = 0,
    profilesAllowed = 0,
    audience: rawAudience,
    benefits,
    extraMonths = 0,
    hasVerification = false,
    isUnlimitedJobs = false,
    isUnlimitedProfiles = false,
    founderCohortStartDate,
    founderCohortCutoff,
    founderDiscount = 0,
    founderExtensionDays = 0,
    founderFreeEndDate,
    trialPeriodDays = 14,
    countryPricings,
  } = data;

  const audience = rawAudience ? rawAudience.toLowerCase().trim() : "all";

  const results = [];

  for (const pricing of countryPricings) {
    const countryRaw = pricing.countryCode || "";
    const isIndia = countryRaw.toUpperCase() === "IN" || countryRaw.toUpperCase() === "INDIA";
    const country = isIndia ? Country.INDIA : Country.INTERNATIONAL;

    let razorpayPlanId: string | null = null;
    const basePrice = pricing.basePrice || pricing.totalPrice;
    const gstPercentage = pricing.gstPercentage || 0;
    const gstAmount = Math.round((basePrice * gstPercentage) / 100);
    const totalPrice = pricing.totalPrice;

    // ✅ Auto-derive currency from countryCode — never trust admin input for this
    // IN → INR, anything else (US, GB, SG...) → USD
    const currencyCode = isIndia ? "INR" : "USD";

    // ✅ Razorpay PLAN creation only for INDIA (INR)
    // International (USD) plans use Razorpay ORDERS (one-time) — subscriptions API doesn't support USD
    if (!isFreePlan && totalPrice > 0 && isIndia) {
      let period: "monthly" | "yearly" = "monthly";
      let interval = duration;

      if (duration >= 12) {
        period = "yearly";
        interval = Math.round(duration / 12);
      }

      const razorpayPlan = await razorpay.plans.create({
        period,
        interval,
        item: {
          name: `${title} (${pricing.countryCode})`,
          amount: totalPrice * 100, // Smallest unit: paise (INR)
          currency: currencyCode,   // Always "INR" for this branch
        },
        notes: {
          description,
          audience,
          countryCode: pricing.countryCode,
        },
      });
      razorpayPlanId = razorpayPlan.id;
    }
    // International plans: razorpayPlanId stays null — payment handled via Razorpay Order at subscription time

    const plan = await prisma.plan.create({
      data: {
        name: name || (duration < 12 ? PlanName.QUARTERLY : PlanName.ANNUAL),
        title,
        description,
        basePrice,
        gstPercentage,
        gstAmount,
        price: totalPrice,
        duration, // Month-based duration
        // ✅ FIX: Annual = 365 days, not duration * 30 (= 360)
        durationDays: duration >= 12 ? 365 : duration * 30,
        isFreePlan,
        freePostsPerMonth,
        jobsAllowed,
        profilesAllowed,
        audience,
        extraMonths,
        hasVerification,
        benefits,
        countryCode: country,
        razorpayPlanId,
        isUnlimitedJobs,
        isUnlimitedProfiles,
        founderCohortStartDate: founderCohortStartDate ? new Date(founderCohortStartDate) : null,
        founderCohortCutoff: founderCohortCutoff ? new Date(founderCohortCutoff) : null,
        founderDiscount,
        founderExtensionDays,
        founderFreeEndDate: founderFreeEndDate ? new Date(founderFreeEndDate) : null,
        trialPeriodDays,
      },
    });
    results.push(plan);
  }

  return results;
};


export async function updatePlan(id: string, data: any) {
  // ✅ FIX: The frontend sends countryPricings as an array,
  // but the DB schema stores these as flat fields on the Plan.
  // Extract the first pricing entry and map it to flat columns.
  if (data.countryPricings && Array.isArray(data.countryPricings) && data.countryPricings.length > 0) {
    const pricing = data.countryPricings[0];
    const countryRaw = (pricing.countryCode || "").toUpperCase();
    const isIndia = countryRaw === "IN" || countryRaw === "INDIA";

    data.countryCode = isIndia ? Country.INDIA : Country.INTERNATIONAL;
    data.price = pricing.totalPrice ?? pricing.price ?? 0;
    data.basePrice = pricing.basePrice ?? 0;
    data.gstPercentage = pricing.gstPercentage ?? 0;
    data.gstAmount = Math.round((data.basePrice * data.gstPercentage) / 100);

    // Must remove — Prisma will throw "Unknown argument" if this is passed
    delete data.countryPricings;
  }

  // ✅ Safety conversion for date fields
  if (data.founderCohortStartDate) data.founderCohortStartDate = new Date(data.founderCohortStartDate);
  if (data.founderCohortCutoff) data.founderCohortCutoff = new Date(data.founderCohortCutoff);
  if (data.founderFreeEndDate) data.founderFreeEndDate = new Date(data.founderFreeEndDate);

  return await prisma.plan.update({ where: { id }, data });
}

export async function deletePlan(id: string) {
  const subscriptionCount = await prisma.subscription.count({
    where: { planId: id },
  });

  if (subscriptionCount > 0) {
    throw new Error(
      `Cannot delete this plan because ${subscriptionCount} subscription(s) are linked to it.`
    );
  }

  return await prisma.plan.delete({ where: { id } });
}

export async function getPlans(country?: Country) {
  return await prisma.plan.findMany({
    where: country ? { countryCode: country } : {},
  });
}



// // services/planService.js
// import { prisma } from "../../config/database";
// import { razorpay } from "../../config/razorpay";

// interface CountryPricingInput {
//   countryCode: string;
//   currency: string;
//   totalPrice: number;        // Total price in smallest unit (paise/cents)
//   basePrice?: number;        // Required for India (before GST)
//   gstPercentage?: number;    // Required for India (18%)
// }

// export const createPlanService = async (data: {
//   title: string;
//   description: string;
//   duration?: number;
//   isFreePlan: boolean;
//   jobsAllowed: number;
//   profilesAllowed: number;
//   audience: string;
//   benefits?: any;
//   extraMonths?: number;
//   hasVerification?: boolean;
//   countryPricing: CountryPricingInput[];  // Manual pricing per country
// }) => {
//   const {
//     title, description, duration, isFreePlan, jobsAllowed, profilesAllowed,
//     audience, benefits, extraMonths, hasVerification = false, countryPricing
//   } = data;

//   if (!isFreePlan && (!countryPricing || countryPricing.length === 0)) {
//     throw new Error("countryPricing is required for paid plans");
//   }

//   // Handle free plans
//   if (isFreePlan) {
//     return await prisma.plan.create({
//       data: {
//         title, description, duration: 0, isFreePlan: true, jobsAllowed,
//         profilesAllowed, audience, benefits, extraMonths: 0,
//         hasVerification: false, countryPricing: {}
//       }
//     });
//   }

//   // Validate India pricing has GST details
//   const indiaPricing = countryPricing.find(p => p.countryCode === "IN");
//   if (indiaPricing && (!indiaPricing.basePrice || !indiaPricing.gstPercentage)) {
//     throw new Error("India pricing must include basePrice and gstPercentage");
//   }

//   // Create Razorpay plans for each country
//   const pricingMap: any = {};
  
//   for (const pricing of countryPricing) {
//     // India: Validate GST calculation
//     if (pricing.countryCode === "IN") {
//       const calculatedGst = Math.round((pricing.basePrice! * pricing.gstPercentage!) / 100);
//       const expectedTotal = pricing.basePrice! + calculatedGst;
//       if (Math.abs(pricing.totalPrice - expectedTotal) > 1) {
//         throw new Error(`India GST calculation mismatch. Expected ${expectedTotal}, got ${pricing.totalPrice}`);
//       }
//     }

//     // Determine period/interval
//     let period: "monthly" | "yearly" = "monthly";
//     let interval = duration || 1;
//     if (duration === 12) { period = "yearly"; interval = 1; }
//     else if (duration && duration > 12 && duration % 12 === 0) {
//       period = "yearly"; interval = duration / 12;
//     }

//     // Create Razorpay plan
//     const razorpayPlan = await razorpay.plans.create({
//       period,
//       interval,
//       item: {
//         name: `${title} (${pricing.countryCode})`,
//         amount: pricing.totalPrice,  // Already in smallest unit
//         currency: pricing.currency.toLowerCase(),
//       },
//       notes: {
//         description, audience,
//         jobsAllowed: jobsAllowed.toString(),
//         profilesAllowed: profilesAllowed.toString(),
//         countryCode: pricing.countryCode,
//       },
//     });

//     // Store pricing details
//     pricingMap[pricing.countryCode] = {
//       razorpayPlanId: razorpayPlan.id,
//       currency: pricing.currency,
//       totalPrice: pricing.totalPrice,
//       ...(pricing.countryCode === "IN" && {
//         basePrice: pricing.basePrice!,
//         gstPercentage: pricing.gstPercentage!,
//         gstAmount: pricing.totalPrice - pricing.basePrice!
//       })
//     };
//   }

//   // Save plan
//   const plan = await prisma.plan.create({
//     data: {
//       title, description, duration, isFreePlan: false, jobsAllowed,
//       profilesAllowed, audience, benefits, extraMonths, hasVerification,
//       countryPricing: pricingMap
//     }
//   });

//   return plan;
// };

// // Update plan (add/remove countries)
// export const updatePlanService = async (planId: string, data: {
//   title?: string;
//   description?: string;
//   duration?: number;
//   jobsAllowed?: number;
//   profilesAllowed?: number;
//   audience?: string;
//   benefits?: any;
//   extraMonths?: number;
//   hasVerification?: boolean;
//   addCountryPricing?: CountryPricingInput[];  // Add new countries
//   removeCountries?: string[];                  // Remove countries
// }) => {
//   const plan = await prisma.plan.findUnique({ where: { id: planId } });
//   if (!plan) throw new Error("Plan not found");

//   let countryPricing = (plan.countryPricing || {}) as Record<string, any>;

//   // Add new countries
//   if (data.addCountryPricing) {
//     for (const pricing of data.addCountryPricing) {
//       // Same validation and Razorpay creation as createPlanService
//       const razorpayPlan = await razorpay.plans.create({
//         period: "monthly",
//         interval: plan.duration || 1,
//         item: {
//           name: `${plan.title} (${pricing.countryCode})`,
//           amount: pricing.totalPrice,
//           currency: pricing.currency.toLowerCase(),
//         },
//         notes: { countryCode: pricing.countryCode }
//       });

//       countryPricing[pricing.countryCode] = {
//         razorpayPlanId: razorpayPlan.id,
//         currency: pricing.currency,
//         totalPrice: pricing.totalPrice,
//         ...(pricing.countryCode === "IN" && {
//           basePrice: pricing.basePrice!,
//           gstPercentage: pricing.gstPercentage!,
//           gstAmount: pricing.totalPrice - pricing.basePrice!
//         })
//       };
//     }
//   }

//   // Remove countries (don't delete Razorpay plans, just remove reference)
//   if (data.removeCountries) {
//     for (const country of data.removeCountries) {
//       delete countryPricing[country];
//     }
//   }

//   return await prisma.plan.update({
//     where: { id: planId },
//     data: { 
//       ...data,
//       countryPricing 
//     }
//   });
// };

// // Get all plans (admin view)
// export const getAllPlansService = async () => {
//   return await prisma.plan.findMany();
// };

// // Get single plan details
// export const getPlanByIdService = async (id: string) => {
//   return await prisma.plan.findUnique({
//     where: { id }
//   });
// };

// // Delete plan
// export const deletePlanService = async (id: string) => {
//   return await prisma.plan.delete({ where: { id } });
// };

// // Get localized plans for frontend
// export const getLocalizedPlansService = async (countryCode: string = "IN") => {
//   const plans = await prisma.plan.findMany();
//   return plans.map(plan => {
//     // countryPricing is stored as Json in Prisma; assert it to a record to safely index by countryCode
//     const countryPricing = plan.countryPricing as Record<string, any> | undefined;
//     return {
//       ...plan,
//       localizedPricing: countryPricing ? countryPricing[countryCode] : null
//     };
//   });
// };

