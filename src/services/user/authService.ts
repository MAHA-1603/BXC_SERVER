import { prisma } from "../../config/database";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { UserStatus, Role, Mode, SubscriptionStatus } from "@prisma/client";
import { sendEmail } from "../../utils/email";
import * as crypto from "crypto";
import { ensureUserHasSubscription } from "../../subscriptions/userSubServices";
import { OAuth2Client } from "google-auth-library";
import { generateUserKeyPair } from "../../utils/e2eeHelper";
import { encryptDocumentUrl, decryptDocumentUrl } from "../../utils/cryptoUtils";
import { validateBusinessNumbers } from "../../utils/businessNumberValidator";

// Google OAuth client for token verification
const googleClient = new OAuth2Client();

const getDomainFromEmail = (email: string) => {
  return email.split("@")[1].toLowerCase();
};

export const registerUser = async (data: any) => {
  if (!data.fullName) throw new Error("Full name is required");
  if (data.email) {
    data.email = data.email.toLowerCase();
  }
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existing) throw new Error("User already exists");

  // Extract domain from main email
  const mainDomain = getDomainFromEmail(data.email);

  // Check if domain already exists in DB
  const existingCompany = await prisma.user.findFirst({
    where: {
      email: {
        endsWith: `@${mainDomain}`, // check any email with this domain
      },
    },
  });

  if (existingCompany) {
    throw new Error(
      `A company with domain ${mainDomain} already exists.Please use a different email.`
    );
  }

  const hashedPassword = await bcrypt.hash(data.password, 10);

  // ✅ Validate country-specific business number formats (only non-empty values)
  const validation = validateBusinessNumbers({
    country: data.country,
    cinNumber: data.cinNumber,
    gstNumber: data.gstNumber,
    panNumber: data.panNumber,
  });
  if (!validation.valid) {
    const messages = Object.entries(validation.errors)
      .map(([field, msg]) => `${field}: ${msg}`)
      .join(" | ");
    throw new Error(`Business number format error — ${messages}`);
  }

  // ✅ Generate RSA-2048 key pair for E2EE (done at registration — one-time cost)
  const { publicKey, privateKey } = generateUserKeyPair();

  // ✅ Trial logic from FREE plan
  let trialEndsAt: Date | null = null;
  const freePlan = await prisma.plan.findFirst({ where: { isFreePlan: true } });

  if (freePlan) {
    trialEndsAt = new Date();
    // Before founderFreeEndDate: get duration months (e.g. 3 months)
    if (freePlan.founderFreeEndDate && trialEndsAt < freePlan.founderFreeEndDate) {
      const months = freePlan.duration || 0;
      trialEndsAt.setMonth(trialEndsAt.getMonth() + months);
    } else {
      // After founderFreeEndDate: get trialPeriodDays (e.g. 14 days)
      const trialDays = freePlan.trialPeriodDays || 0;
      trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
    }
  }

  // Encrypt document URLs if provided
  const documentFields = ["panDocumentUrl", "cinDocumentUrl", "gstDocumentUrl"];
  let hasDocsToEncrypt = false;
  for (const field of documentFields) {
    if (data[field] && !data[field].startsWith("ENC:")) {
      hasDocsToEncrypt = true;
    }
  }

  // Create the new user (with RSA key pair for E2EE)
  let newUser = await prisma.user.create({
    data: {
      ...data,
      password: hashedPassword,
      publicKey,  // ← RSA-2048 public key
      privateKey, // ← RSA-2048 private key
      status: UserStatus.PENDING, // new users start as PENDING
      mode: data.mode || Mode.SEEKER, // 👈 default PROVIDER if not passed
      trialEndsAt,
    },
  });

  // If documents exist, encrypt them
  if (hasDocsToEncrypt) {
    const updateDocs: any = {};
    for (const field of documentFields) {
      if (data[field] && !data[field].startsWith("ENC:")) {
        updateDocs[field] = encryptDocumentUrl(data[field]);
      }
    }
    newUser = await prisma.user.update({
      where: { id: newUser.id },
      data: updateDocs
    });
  }

  // ✅ Notify all admins about the new registration
  const admins = await prisma.admin.findMany({
    where: { role: Role.ADMIN },
    select: { email: true, fullName: true },
  });

  const adminEmails = admins.map((a: { email: any; }) => a.email);

  if (adminEmails.length > 0) {
    const subject = "New User Registration - Approval Required";
    const message = `
      Hello Admin,
      
      A new user has registered on BenchXchange:
      
      Name: ${newUser.fullName}
      Email: ${newUser.email}
      Company: ${newUser.companyName || "N/A"}
      
      Please review and approve their account.
      
      - BenchXchange Team
    `;

    // Send email to all admins
    await Promise.all(
      adminEmails.map((email: string) => sendEmail(email, subject, message))
    );
  }

  // ✅ Send welcome email to the new user (fire-and-forget)
  sendEmail(
    newUser.email,
    "Welcome to BenchXchange! 🎉",
    `Hi ${newUser.fullName},

Thank you for creating your account on BenchXchange!

Your registration has been received and is currently pending approval. Our team will review your account shortly.

Once approved, you'll receive an email notification and will be able to log in and start using the platform.

If you have any questions, feel free to reach out to our support team.

Best regards,
The BenchXchange Team`,
    `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Welcome to BenchXchange! 🎉</h2>
      <p>Hi <strong>${newUser.fullName}</strong>,</p>
      <p>Thank you for creating your account on BenchXchange!</p>
      <p>Your registration has been received and is <strong>currently pending approval</strong>. Our team will review your account shortly.</p>
      <p>Once approved, you'll receive an email notification and will be able to log in and start using the platform.</p>
      <p>If you have any questions, feel free to reach out to our support team.</p>
      <br/>
      <p>Best regards,<br/><strong>The BenchXchange Team</strong></p>
    </div>`
  ).catch((err) => console.error("Welcome email failed:", err));

  // Exclude password before returning
  const { password, ...userWithoutPassword } = newUser;

  return userWithoutPassword;
};

export const loginUser = async (email: string, password: string) => {
  email = email.toLowerCase();
  // OPTIMIZED: Run admin and user queries in parallel instead of sequential
  const [admin, user] = await Promise.all([
    prisma.admin.findUnique({ where: { email } }),
    prisma.user.findUnique({
      where: { email },
      include: {
        Subscription: {
          where: { status: SubscriptionStatus.ACTIVE },
          orderBy: { createdAt: "desc" },
          include: {
            plan: true,
            Payment: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    })
  ]);

  // Use admin if found, otherwise use user
  let account: any = admin || user;
  let isAdmin = !!admin;

  if (!account) throw new Error("User not found");

  const isMatch = await bcrypt.compare(password, account.password);
  if (!isMatch) throw new Error("Invalid password");

  // Check for suspended status
  if (account.status === UserStatus.SUSPENDED) {
    throw new Error("Your account has been suspended. Please contact support.");
  }

  if (account.status !== UserStatus.APPROVED) {
    throw Error("User not approved yet");
  }

  if (!isAdmin && account.Subscription?.length === 0) {
    try {
      const createdSub = await ensureUserHasSubscription(account.id);
      console.log(`✅ Subscription creation attempt - result:`, createdSub ? "Created" : "Failed");

      // 👈 CRITICAL FIX: RE-FETCH user with fresh subscriptions
      account = await prisma.user.findUnique({
        where: { id: account.id },
        include: {
          Subscription: {
            where: { status: SubscriptionStatus.ACTIVE },
            orderBy: { createdAt: "desc" },
            include: {
              plan: true,
              Payment: {
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          },
        },
      });

      console.log(`✅ After refetch - Subscription count:`, account?.Subscription?.length || 0);
      if (!account?.Subscription?.length) {
        console.warn("⚠️ Warning: Subscription created but not found in refetch");
      }
    } catch (error) {
      console.error("Free plan assignment failed (non-blocking):", error);
    }
  }

  // ✅ LAZY MIGRATION: Generate missing E2EE keys for legacy users
  if (!isAdmin && (!account.publicKey || !account.privateKey)) {
    console.log(`[E2EE] Generating missing keys for legacy user: ${account.email}`);
    const { publicKey, privateKey } = generateUserKeyPair();
    await prisma.user.update({
      where: { id: account.id },
      data: { publicKey, privateKey }
    });
    account.publicKey = publicKey;
    account.privateKey = privateKey;
  }

  // ✅ LAZY MIGRATION: Encrypt legacy plain-text document URLs
  const documentFields = ["panDocumentUrl", "cinDocumentUrl", "gstDocumentUrl"];
  const docUpdates: any = {};
  let needsDocUpdate = false;
  for (const field of documentFields) {
    const val = (account as any)[field];
    if (val && !val.startsWith("ENC:")) {
      docUpdates[field] = encryptDocumentUrl(val);
      needsDocUpdate = true;
    }
  }
  if (needsDocUpdate) {
    await prisma.user.update({ where: { id: account.id }, data: docUpdates });
    console.log(`[Security] Encrypted legacy documents for user: ${account.email}`);
  }

  const token = jwt.sign(
    { userId: account.id, role: isAdmin ? Role.ADMIN : account.role },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );

  // Fire-and-forget: Send email asynchronously without blocking response
  // This reduces login time from ~6.5s to ~500ms
  sendEmail(
    account.email,
    "Login Alert - BenchXchange",
    `Hi ${account.fullName},\n\nYou have successfully logged into your BenchXchange account.\n\nIf this wasn't you, please reset your password immediately.\n\n- BenchXchange Team`
  ).catch((err) => console.error("Login alert email failed:", err));

  // Fire-and-forget: update lastLoginAt without blocking login response
  if (isAdmin) {
    prisma.admin.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    }).catch((err: any) => console.error("Failed to update admin lastLoginAt:", err));
  } else {
    prisma.user.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    }).catch((err: any) => console.error("Failed to update user lastLoginAt:", err));
  }

  const { password: _, ...accountWithoutPassword } = account;

  for (const field of documentFields) {
    if (accountWithoutPassword[field as keyof typeof accountWithoutPassword]) {
      (accountWithoutPassword as any)[field] = await decryptDocumentUrl(accountWithoutPassword[field as keyof typeof accountWithoutPassword] as string);
    }
  }

  // Use free plan cutoff as a general "isFounder" flag for UI
  const freePlan = await prisma.plan.findFirst({ where: { isFreePlan: true } });
  const isFounder = freePlan ? (
    (!freePlan.founderCohortStartDate || accountWithoutPassword.createdAt >= freePlan.founderCohortStartDate) &&
    (!freePlan.founderCohortCutoff || accountWithoutPassword.createdAt <= freePlan.founderCohortCutoff)
  ) : false;

  return { token, user: { ...accountWithoutPassword, isFounder }, isAdmin };
};

// Google Social Login with Token Verification (Web, Android, iOS)
export const socialLogin = async (idToken: string) => {
  // 1. Verify the Google ID token
  let payload;
  try {
    // Get all valid client IDs from environment
    const validClientIds = [
      process.env.GOOGLE_WEB_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
      process.env.GOOGLE_IOS_CLIENT_ID,
    ].filter(Boolean) as string[];

    if (validClientIds.length === 0) {
      throw new Error("Google client IDs not configured");
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: validClientIds, // Accepts tokens from Web, Android, or iOS
    });

    payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new Error("Invalid token payload");
    }
  } catch (error: any) {
    console.error("Google token verification failed:", error.message);
    throw new Error("Invalid Google token. Please try again.");
  }

  const email = payload.email.toLowerCase();

  // 2. Check if user exists - NO auto-registration
  let user = await prisma.user.findUnique({
    where: { email },
    include: {
      Subscription: {
        where: { status: SubscriptionStatus.ACTIVE },
        orderBy: { createdAt: "desc" },
        include: {
          plan: true,
          Payment: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!user) {
    throw new Error("User not found. Please register first.");
  }

  // 3. Apply same checks as loginUser
  if (user.status === UserStatus.SUSPENDED) {
    throw new Error("Your account has been suspended. Please contact support.");
  }

  if (user.status !== UserStatus.APPROVED) {
    throw new Error("User not approved yet");
  }

  // 4. Activate free plan if no subscription (same as loginUser)
  if (user.Subscription?.length === 0) {
    try {
      const createdSub = await ensureUserHasSubscription(user.id);
      console.log(`✅ Social login - Subscription creation attempt - result:`, createdSub ? "Created" : "Failed");

      // Re-fetch user with fresh subscriptions
      user = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          Subscription: {
            where: { status: SubscriptionStatus.ACTIVE },
            orderBy: { createdAt: "desc" },
            include: {
              plan: true,
              Payment: {
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          },
        },
      });

      console.log(`✅ Social login - After refetch - Subscription count:`, user?.Subscription?.length || 0);
      if (!user?.Subscription?.length) {
        console.warn("⚠️ Warning: Subscription created but not found in social login refetch");
      }
    } catch (error) {
      console.error("Free plan assignment failed (non-blocking):", error);
    }
  }

  // ✅ LAZY MIGRATION: Generate missing E2EE keys for legacy users (Social Login)
  if (user && (!user.publicKey || !user.privateKey)) {
    console.log(`[E2EE] Generating missing keys for legacy user (Social): ${user.email}`);
    const { publicKey, privateKey } = generateUserKeyPair();
    await prisma.user.update({
      where: { id: user.id },
      data: { publicKey, privateKey }
    });
    user.publicKey = publicKey;
    user.privateKey = privateKey;
  }

  if (!user) throw new Error("User re-fetch failed");

  // ✅ LAZY MIGRATION: Encrypt legacy plain-text document URLs (Social)
  const socialDocFields = ["panDocumentUrl", "cinDocumentUrl", "gstDocumentUrl"];
  const socialDocUpdates: any = {};
  let needsSocialDocUpdate = false;
  for (const field of socialDocFields) {
    const val = (user as any)[field];
    if (val && !val.startsWith("ENC:")) {
      socialDocUpdates[field] = encryptDocumentUrl(val);
      needsSocialDocUpdate = true;
    }
  }
  if (needsSocialDocUpdate) {
    await prisma.user.update({ where: { id: user.id }, data: socialDocUpdates });
    console.log(`[Security] Encrypted legacy documents for user (Social): ${user.email}`);
  }

  // 5. Generate JWT (same as loginUser)
  const token = jwt.sign(
    { userId: user!.id, role: user!.role },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );

  // 6. Send login alert email (fire-and-forget)
  sendEmail(
    user!.email,
    "Login Alert - BenchXchange",
    `Hi ${user!.fullName},\n\nYou have successfully logged into your BenchXchange account via Google.\n\nIf this wasn't you, please contact support immediately.\n\n- BenchXchange Team`
  ).catch((err) => console.error("Login alert email failed:", err));

  // Fire-and-forget: update lastLoginAt without blocking login response
  prisma.user.update({
    where: { id: user!.id },
    data: { lastLoginAt: new Date() },
  }).catch((err: any) => console.error("Failed to update lastLoginAt:", err));

  // 7. Return SAME structure as loginUser
  const { password: _, ...userWithoutPassword } = user!;

  for (const field of socialDocFields) {
    if (userWithoutPassword[field as keyof typeof userWithoutPassword]) {
      (userWithoutPassword as any)[field] = await decryptDocumentUrl(userWithoutPassword[field as keyof typeof userWithoutPassword] as string);
    }
  }

  const freePlan = await prisma.plan.findFirst({ where: { isFreePlan: true } });
  const isFounder = freePlan ? (
    (!freePlan.founderCohortStartDate || userWithoutPassword.createdAt >= freePlan.founderCohortStartDate) &&
    (!freePlan.founderCohortCutoff || userWithoutPassword.createdAt <= freePlan.founderCohortCutoff)
  ) : false;
  return { token, user: { ...userWithoutPassword, isFounder }, isAdmin: false };
};

export const forgotPassword = async (email: string) => {
  email = email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found");

  if (user.status !== UserStatus.APPROVED) {
    if (user.status === UserStatus.PENDING) {
      throw new Error("Your account is still pending approval.");
    }
    if (user.status === UserStatus.REJECTED) {
      throw new Error("Your account has been rejected.");
    }
    throw new Error("Your account is not approved.");
  }

  const otp = crypto.randomInt(100000, 999999).toString();

  await prisma.resetToken.create({
    data: {
      userId: user.id,
      token: otp,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  await sendEmail(
    user.email,
    "Reset Your BenchXchange Password 🔑",
    `Hi ${user.fullName},\n\nYour OTP to reset password is: ${otp}\n\nIt is valid for 10 minutes.\n\n- BenchXchange Team`
  );

  return { message: "OTP sent to registered email." };
};

export const resetPassword = async (
  email: string,
  otp: string,
  newPassword: string
) => {
  email = email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found");

  // Fetch OTP record
  const resetRecord = await prisma.resetToken.findFirst({
    where: { userId: user.id, token: otp },
    orderBy: { createdAt: "desc" },
  });

  if (!resetRecord) throw new Error("Invalid OTP");
  if (resetRecord.expiresAt < new Date()) throw new Error("OTP expired");

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  });

  await prisma.resetToken.delete({ where: { id: resetRecord.id } });

  return { message: "Password reset successful." };
};

export const getUserDetails = async (email: string) => {
  email = email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { status: "NEW", message: "User not found. Please register." };
  }

  const { password, ...userWithoutPassword } = user;

  let message = "";
  switch (user.status) {
    case "APPROVED":
      message = "Your account is already approved, Please login.";
      break;
    case "REJECTED":
      message = "Your account was rejected. Please reapply.";
      break;
    case "PENDING":
      message = "Your account is under review. Please wait for approval.";
      break;
    default:
      message = "Unknown status.";
  }

  return { message, ...userWithoutPassword };
};

export const reapplyUser = async (email: string, newData: any) => {
  email = email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error("User not found");

  if (user.status !== "REJECTED") {
    throw new Error("You can only reapply if your account was rejected");
  }

  let updatedData = { ...newData };

  if (newData.password) {
    updatedData.password = await bcrypt.hash(newData.password, 10);
  }

  // ✅ ENCRYPT document URLs during re-application
  const reapplyDocFields = ["panDocumentUrl", "cinDocumentUrl", "gstDocumentUrl"];
  for (const field of reapplyDocFields) {
    if (updatedData[field] && !updatedData[field].startsWith("ENC:")) {
      updatedData[field] = encryptDocumentUrl(updatedData[field]);
    }
  }

  return prisma.user.update({
    where: { email },
    data: {
      ...updatedData,
      status: "PENDING",
    },
  });
};

export const sendLoginOTP = async (email: string) => {
  email = email.toLowerCase();

  const [admin, user] = await Promise.all([
    prisma.admin.findUnique({ where: { email } }),
    prisma.user.findUnique({ where: { email } }),
  ]);

  const account = admin || user;

  if (!account) {
    throw new Error("User not found. Please register first.");
  }

  const isAdmin = !!admin;

  if (account.status === UserStatus.SUSPENDED) {
    throw new Error("Your account has been suspended. Please contact support.");
  }

  if (account.status !== UserStatus.APPROVED) {
    throw new Error("Account not approved yet");
  }

  const otp = crypto.randomInt(100000, 999999).toString();

  // Create or update OTP for the user/admin (delete old ones)
  if (isAdmin) {
    await prisma.loginOTP.deleteMany({ where: { adminId: account.id } });
    await prisma.loginOTP.create({
      data: {
        adminId: account.id,
        token: otp,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      },
    });
  } else {
    await prisma.loginOTP.deleteMany({ where: { userId: account.id } });
    await prisma.loginOTP.create({
      data: {
        userId: account.id,
        token: otp,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      },
    });
  }

  await sendEmail(
    account.email,
    "Your BenchXchange Login OTP 🔐",
    `Hi ${account.fullName},

Your One-Time Password (OTP) for logging in to BenchXchange is: ${otp}

This OTP is valid for 5 minutes. Do not share this code with anyone.

If you did not request this, please ignore this email or contact support immediately.

Regards,  
BenchXchange Team`,
    `
  <div style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px;">
    <div style="max-width: 600px; margin: auto; background: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
      
      <h2 style="color: #2c3e50; text-align: center;">🔐 BenchXchange</h2>
      <h3 style="color: #34495e;">Login Verification Code</h3>

      <p>Hi <strong>${account.fullName}</strong>,</p>

      <p>We received a request to log in to your BenchXchange account. Use the OTP below to continue:</p>

      <div style="background: #f4f6f8; padding: 20px; text-align: center; border-radius: 8px; margin: 25px 0;">
        <span style="font-size: 34px; font-weight: bold; letter-spacing: 6px; color: #2c7be5;">
          ${otp}
        </span>
      </div>

      <p style="margin-top: 10px;">⏱️ This code will expire in <strong>5 minutes</strong>.</p>

      <p style="color: #e74c3c; font-size: 14px;">
        ⚠️ For security reasons, never share your OTP with anyone.
      </p>

      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />

      <p style="font-size: 13px; color: #777;">
        If you didn’t request this login, you can safely ignore this email or contact our support team.
      </p>

      <p style="font-size: 13px; color: #777;">
        📩 Support: support@benchxchange.com
      </p>

      <p style="font-size: 12px; color: #aaa; margin-top: 20px;">
        © ${new Date().getFullYear()} BenchXchange. All rights reserved.
      </p>

    </div>
  </div>
  `
  );

  return { message: "OTP sent to registered email." };
};

export const loginWithOTP = async (email: string, otp: string) => {
  email = email.toLowerCase();

  const [admin, user] = await Promise.all([
    prisma.admin.findUnique({ where: { email } }),
    prisma.user.findUnique({
      where: { email },
      include: {
        Subscription: {
          where: { status: SubscriptionStatus.ACTIVE },
          orderBy: { createdAt: "desc" },
          include: {
            plan: true,
            Payment: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    }),
  ]);

  let account: any = admin || user;
  const isAdmin = !!admin;

  if (!account) throw new Error("User not found");

  // Verify OTP
  const otpRecord = await prisma.loginOTP.findFirst({
    where: {
      OR: [
        { userId: account.id, token: otp },
        { adminId: account.id, token: otp },
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otpRecord) throw new Error("Invalid OTP");
  if (otpRecord.expiresAt < new Date()) throw new Error("OTP expired");

  // Status checks (consistent with regular login)
  if (account.status === UserStatus.SUSPENDED) {
    throw new Error("Your account has been suspended. Please contact support.");
  }

  if (account.status !== UserStatus.APPROVED) {
    throw new Error("Account not approved yet");
  }

  // Handle free plan activation if no subscription (only for users)
  if (!isAdmin && account.Subscription?.length === 0) {
    try {
      await ensureUserHasSubscription(account.id);
      account = await prisma.user.findUnique({
        where: { id: account.id },
        include: {
          Subscription: {
            where: { status: SubscriptionStatus.ACTIVE },
            orderBy: { createdAt: "desc" },
            include: {
              plan: true,
              Payment: {
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
          },
        },
      });
    } catch (error) {
      console.error("Free plan assignment failed (non-blocking):", error);
    }
  }

  // ✅ LAZY MIGRATION: Generate missing E2EE keys for legacy users (OTP Login)
  if (!isAdmin && (!account.publicKey || !account.privateKey)) {
    console.log(`[E2EE] Generating missing keys for legacy user (OTP): ${account.email}`);
    const { publicKey, privateKey } = generateUserKeyPair();
    await prisma.user.update({
      where: { id: account.id },
      data: { publicKey, privateKey }
    });
    account.publicKey = publicKey;
    account.privateKey = privateKey;
  }

  // ✅ LAZY MIGRATION: Encrypt legacy plain-text document URLs (OTP)
  const otpDocFields = ["panDocumentUrl", "cinDocumentUrl", "gstDocumentUrl"];
  const otpDocUpdates: any = {};
  let needsOtpDocUpdate = false;
  for (const field of otpDocFields) {
    const val = (account as any)[field];
    if (val && !val.startsWith("ENC:")) {
      otpDocUpdates[field] = encryptDocumentUrl(val);
      needsOtpDocUpdate = true;
    }
  }
  if (needsOtpDocUpdate) {
    await prisma.user.update({ where: { id: account.id }, data: otpDocUpdates });
    console.log(`[Security] Encrypted legacy documents for user (OTP): ${account.email}`);
  }

  const token = jwt.sign(
    { userId: account.id, role: isAdmin ? Role.ADMIN : account.role },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" }
  );

  // Fire-and-forget: email alert and lastLoginAt
  sendEmail(
    account.email,
    "New Login to BenchXchange",
    `Hi ${account.fullName},\n\nYou have successfully logged into your BenchXchange account using an OTP.\n\nIf this wasn't you, please contact support immediately.\n\n- BenchXchange Team`
  ).catch((err) => console.error("Login alert email failed:", err));

  if (isAdmin) {
    prisma.admin.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    }).catch((err: any) => console.error("Failed to update admin lastLoginAt:", err));
  } else {
    prisma.user.update({
      where: { id: account.id },
      data: { lastLoginAt: new Date() },
    }).catch((err: any) => console.error("Failed to update user lastLoginAt:", err));
  }

  // Clean up OTP record
  prisma.loginOTP.delete({ where: { id: otpRecord.id } }).catch(() => { });

  const { password: _, ...accountWithoutPassword } = account!;

  for (const field of otpDocFields) {
    if (accountWithoutPassword[field as keyof typeof accountWithoutPassword]) {
      (accountWithoutPassword as any)[field] = await decryptDocumentUrl(accountWithoutPassword[field as keyof typeof accountWithoutPassword] as string);
    }
  }

  return { token, user: accountWithoutPassword, isAdmin };
};
