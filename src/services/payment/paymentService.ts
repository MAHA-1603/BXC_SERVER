import { prisma } from "../../config/database";
import { razorpay } from "../../config/razorpay";
import { Country, PaymentType, PaymentCurrency, PostCategory } from "@prisma/client";
// No exchange rate import needed — international orders use USD natively

// ✅ Fully dynamic — reads pricing from AddOn DB (admin-managed)
export const createPaymentOrder = async (
  userId: string,
  type: PaymentType,
  country: Country,
  postCategory?: PostCategory // Required for type === POST
) => {
  const isIndia = country === Country.INDIA;
  const currency = isIndia ? "INR" : "USD";

  // Map PaymentType → AddOn DB lookup
  let addon = null;

  if (type === PaymentType.POST) {
    if (!postCategory) throw new Error("Post category required for post payment");
    addon = await prisma.addOn.findFirst({ 
      where: { 
        category: postCategory,
        countryCode: country
      } 
    });
  } else if (type === PaymentType.BOOST) {
    addon = await prisma.addOn.findFirst({ 
      where: { 
        type: PaymentType.BOOST,
        countryCode: country
      } 
    });
  } else if (type === PaymentType.REFRESH) {
    addon = await prisma.addOn.findFirst({ 
      where: { 
        type: PaymentType.REFRESH,
        countryCode: country
      } 
    });
  }
 
  if (!addon) throw new Error(`No addon pricing found for type: ${type} in ${country}`);
 
  const amount = addon.price ?? 0;

  // ✅ Use native currency: INR for India (paise), USD for International (cents).
  // No backend conversion — Razorpay handles international USD payments directly.
  const razorpayCurrency = isIndia ? "INR" : "USD";
  const razorpayAmount = Math.round(amount * 100); // paise (INR) or cents (USD)

  if (!isIndia) {
    console.log(`[Payment Service] International USD order: $${amount} = ${razorpayAmount} cents`);
  }

  // Unified Razorpay for both INDIA (INR/paise) and INTERNATIONAL (USD/cents)
  const order = await razorpay.orders.create({
    amount: razorpayAmount,
    currency: razorpayCurrency, // ✅ INR for India, USD for International
    receipt: `receipt_${Date.now()}`,
  });

  return {
    gateway: "RAZORPAY",
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
  };
};

export const verifyOneTimePayment = async (
  userId: string,
  type: PaymentType,
  country: Country,
  data: any // razorpay info (razorpayPaymentId, razorpayOrderId, razorpaySignature, amount)
) => {
  // Verification is handled by checking the signature in the controller before calling this
  // or logic can be added here if needed.
  return await prisma.payment.create({
    data: {
      userId,
      type,
      amount: data.amount, // amount should be in base units if frontend passes it that way
      currency: country === Country.INDIA ? PaymentCurrency.INR : PaymentCurrency.USD,
      status: "SUCCESS",
      razorpayPaymentId: data.razorpayPaymentId,
      razorpayOrderId: data.razorpayOrderId,
      razorpaySignature: data.razorpaySignature,
    },
  });
};
