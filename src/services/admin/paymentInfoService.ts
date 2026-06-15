// services/adminService.ts
import { prisma } from "../../config/database";
import { SubscriptionStatus, PaymentStatus } from "@prisma/client";

export async function getAllUserPayments(page: number, limit: number) {
  const [payments, transactions] = await Promise.all([
    prisma.payment.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        subscription: {
          include: {
            user: true,
            plan: true,
          },
        },
        user: true,
      },
    }),
    prisma.transaction.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: true,
      },
    }),
  ]);

  const subscriptionList = payments.map((payment) => ({
    paymentId: payment.id,
    type: "SUBSCRIPTION",
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    createdAt: payment.createdAt,
    razorpayPaymentId: payment.razorpayPaymentId,
    userId: payment.userId,
    userName: payment.user?.fullName || "Deleted User",
    userEmail: payment.user?.email || "N/A",
    userCompanyName: payment.user?.companyName || "N/A",
    userProfilePicture: payment.user?.profilePicture || null,
    subscriptionStatus: payment.subscription?.status || "N/A",
    planTitle: payment.subscription?.plan?.title || "Deleted/No Plan",
    subscriptionStartDate: payment.subscription?.startDate || null,
    subscriptionEndDate: payment.subscription?.endDate || null,
  }));

  const transactionList = transactions.map((transaction) => ({
    paymentId: transaction.id,
    type: transaction.type, // POST, BOOST, REFRESH
    amount: transaction.amount,
    currency: transaction.currency,
    status: transaction.status,
    createdAt: transaction.createdAt,
    razorpayPaymentId: transaction.referenceId,
    userId: transaction.userId,
    userName: transaction.user?.fullName || "Deleted User",
    userEmail: transaction.user?.email || "N/A",
    userCompanyName: transaction.user?.companyName || "N/A",
    userProfilePicture: transaction.user?.profilePicture || null,
    subscriptionStatus: "N/A",
    planTitle: "Add-on Purchase",
    subscriptionStartDate: null,
    subscriptionEndDate: null,
  }));

  return [...subscriptionList, ...transactionList].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

export async function getUserSubscriptions(userId: string, page: number , limit: number) {
  const subs = await prisma.subscription.findMany({
    where: { userId },
    skip: (page - 1) * limit,
    take: limit,
    include: {
      plan: true,
      user: {
        select: {
          id: true,
          fullName: true,
          companyName: true,
          profilePicture: true,
          email: true,
        }
      },
    },
    orderBy: { startDate: "desc" },
  });
  
  return subs.map(sub => ({
    ...sub,
    user: sub.user || { fullName: "Unknown User", email: "N/A", companyName: "N/A", profilePicture: null }
  }));
}

export async function getAllUsersAddonPurchaseHistory(page: number, limit: number) {
  const [purchases, total] = await Promise.all([
    prisma.addOnPurchase.findMany({
      skip: (page - 1) * limit,
      take: limit,
      include: {
        addon: true,
        user: {
          select: {
            fullName: true,
            email: true,
            companyName: true,
            profilePicture: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    }),
    prisma.addOnPurchase.count(),
  ]);

  const data = purchases.map(purchase => ({
    purchaseId: purchase.id,
    userId: purchase.userId,
    userName: purchase.user?.fullName || "Deleted User",
    userEmail: purchase.user?.email || "N/A",
    userCompanyName: purchase.user?.companyName || "N/A",
    userProfilePicture: purchase.user?.profilePicture || null,
    addonTitle: purchase.addon?.title || "Unknown Addon",
    description: purchase.addon?.description || "N/A",
    amount: purchase.amount,
    status: purchase.status,
    purchaseDate: purchase.createdAt,
    expiryDate: null,
    hasVerification: purchase.addon?.hasVerification || false,
    hasPriorityTag: purchase.addon?.hasPriorityTag || false,
  }));

  return {
    data,
    pagination: {
      totalItems: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      limit,
    },
  };
}



export async function getRevenueProjection(year?: number, month?: number) {
  let startDate: Date;
  let endDate: Date;

  if (year && month) {
    // For a specific month and year, show monthly data for entire year
    startDate = new Date(year, 0, 1); // start of year
    endDate = new Date(year + 1, 0, 1); // start of next year (exclusive)
  } else {
    // For no params, default to last 12 months
    const now = new Date();
    startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  const [monthlyRevenueRaw, monthlyTransactionRaw] = await Promise.all([
    prisma.payment.groupBy({
      by: ["createdAt"],
      _sum: { amount: true },
      where: {
        createdAt: { gte: startDate, lt: endDate },
        status: "SUCCESS", // Updated from CAPTURED to SUCCESS
      },
    }),
    prisma.transaction.groupBy({
      by: ["createdAt"],
      _sum: { amount: true },
      where: {
        createdAt: { gte: startDate, lt: endDate },
        status: "SUCCESS",
      },
    }),
  ]);

  const monthlyRevenue: { [key: string]: number } = {};

  // Process subscription revenue
  monthlyRevenueRaw.forEach((record) => {
    if (record.createdAt) {
      const key = `${record.createdAt.getFullYear()}-${record.createdAt.getMonth() + 1}`;
      monthlyRevenue[key] = (monthlyRevenue[key] || 0) + (record._sum.amount ?? 0);
    }
  });

  // Process transaction (addon) revenue
  monthlyTransactionRaw.forEach((record) => {
    if (record.createdAt) {
      const key = `${record.createdAt.getFullYear()}-${record.createdAt.getMonth() + 1}`;
      monthlyRevenue[key] = (monthlyRevenue[key] || 0) + (record._sum.amount ?? 0);
    }
  });

  let yearlyRevenue = 0;
  if (year) {
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${m}`;
      yearlyRevenue += monthlyRevenue[key] || 0;
    }
  } else {
    yearlyRevenue = Object.values(monthlyRevenue).reduce((acc, val) => acc + val, 0);
  }

  return {
    monthlyRevenue,
    yearlyRevenue,
  };
}

export async function getAllUsersSubscriptions(page: number, limit: number) {
  const [subs, total] = await Promise.all([
    prisma.subscription.findMany({
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            companyName: true,
            profilePicture: true,
            email: true,
          }
        },
        plan: true,
      },
      orderBy: {
        startDate: "desc",
      },
    }),
    prisma.subscription.count(),
  ]);

  const data = subs.map(sub => ({
    ...sub,
    planTitle: sub.plan?.title || "Deleted Plan",
    user: sub.user || { fullName: "Deleted User", email: "N/A", companyName: "N/A", profilePicture: null }
  }));

  return {
    data,
    pagination: {
      totalItems: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      limit,
    },
  };
}

export async function getUnifiedAddonHistory(page: number, limit: number) {
  const [purchases, transactions, totalPurchases, totalTransactions] = await Promise.all([
    prisma.addOnPurchase.findMany({
      skip: (page - 1) * limit,
      take: limit,
      include: {
        addon: true,
        user: {
          select: { fullName: true, email: true, companyName: true, profilePicture: true }
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.transaction.findMany({
      where: {
        NOT: { type: "SUBSCRIPTION" }
      },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: {
          select: { fullName: true, email: true, companyName: true, profilePicture: true }
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    prisma.addOnPurchase.count(),
    prisma.transaction.count({
      where: { NOT: { type: "SUBSCRIPTION" } }
    })
  ]);

  const packData = purchases.map(p => ({
    id: p.id,
    type: "PACK",
    addonType: p.addon?.type || "ADDON",
    addonTitle: p.addon?.title || "Addon Pack",
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    createdAt: p.createdAt,
    userName: p.user?.fullName || "Deleted User",
    userEmail: p.user?.email || "N/A",
    referenceId: p.paymentId || p.orderId
  }));

  const transactionData = transactions.map(t => ({
    id: t.id,
    type: "DIRECT_PAY",
    addonType: t.type,
    addonTitle: `${t.type} (Direct)`,
    amount: t.amount,
    currency: t.currency,
    status: t.status,
    createdAt: t.createdAt,
    userName: t.user?.fullName || "Deleted User",
    userEmail: t.user?.email || "N/A",
    referenceId: t.referenceId
  }));

  // Merge and sort
  const combinedData = [...packData, ...transactionData]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);

  return {
    data: combinedData,
    pagination: {
      totalItems: totalPurchases + totalTransactions,
      totalPages: Math.ceil((totalPurchases + totalTransactions) / limit),
      currentPage: page,
      limit
    }
  };
}
