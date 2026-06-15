import express, { Request, Response, NextFunction, Router } from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import http, { get } from "http";
import { Server } from "socket.io";
import { setupSocket } from "./socket/chatSockets";
import { setupEscalationChat } from "./socket/escalationChats";
import chatRoutes from "./routes/user/chatRoutes";
import jwt from "jsonwebtoken";
import { globalErrorHandler } from "./utils/errorHandler";

import authRoutes from "./routes/user/auth";
import { authenticate } from "./middleware/auth";
import { requireActiveSubscription } from "./middleware/subscriptionCheck";
import adminRoutes from "./routes/admin/admin";
import userRoutes from "./routes/user/userRoutes";
import adminAccountRoutes from "./routes/admin/profileRoutes";
import providerRoutes from "./routes/user/providerRoutes";
import seekerRoutes from "./routes/user/seekerPostRoutes";
import searchRoutes from "./routes/user/searchRoutes";
import applicationRoutes from "./routes/user/applicationRoutes";
import providerDashRoutes from "./routes/user/providerDashRoutes";
import bucketRoutes from "./routes/bucketRoutes";
import dealRoutes from "./routes/user/dealRoutes";
import adminDealRoutes from "./routes/admin/dealRoutes";
import notificationRoutes from "./routes/notification/userNotiRoutes";
import adminNotificationRoutes from "./routes/admin/notificationRoutes";
import planRoutes from "./routes/admin/plansRoutes";
import addonRoutes from "./routes/admin/addonRoutes";
import planDetails from "./subscriptions/userSubRoutes";
import "./utils/cronupdates";
import addonOrders from "./subscriptions/addonRoutes";
import getRevenueInfo from "./routes/admin/paymentInfo";
import escalationChats from "./routes/admin/escalationchat.routes";
import dashboardRoutes from "./routes/admin/dashboardRoutes";
import supportRoutes from "./support/supportRoutes";
import adminBlogRoutes from "./routes/admin/blogRoutes";
import publicBlogRoutes from "./routes/user/blogRoutes";
import { userPushRoutes, adminPushRoutes } from "./pushNotifications";
import { dbHealthCheck } from "./config/database";
import { mongoSanitizer, xssSanitizer, hppProtection } from "./middleware/security";
import adminAnalyticsRoutes from "./routes/admin/adminAnalyticsRoutes"; // NEW
import auditLogRoutes from "./routes/admin/auditLogRoutes";
import adminSubscriptionRoutes from "./routes/admin/adminSubscriptionRoutes";
import matchingRoutes from "./routes/user/matchingRoutes";
import paymentRoutes from "./routes/user/paymentRoutes";
import { apiLimiter } from "./middleware/rateLimiter";
import razorpayWebhookRoutes from "./routes/webhook/razorpayWebhookRoutes";
import { getAllProviderPosts, getPostsController, getPostsByIdController, getMyProviderPosts } from "./controllers/user/providerPostcontroller";
import * as seekerPostController from "./controllers/user/seekerPostController";

dotenv.config();

const app = express();

app.use(helmet());

 app.use(express.json({ limit: "10mb" })); // Support JSON
app.use(express.urlencoded({ extended: true }));

app.use(mongoSanitizer);    
app.use(xssSanitizer);      
app.use(hppProtection); 

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
  : ["http://localhost:3000"];

const isOriginAllowed = (origin: string): boolean => {
  if (allowedOrigins.includes(origin)) return true;
  // Allow Netlify dynamic previews & branch deploys
  if (/^https:\/\/.*--benchxchange\.netlify\.app$/.test(origin)) return true;
  return false;
};


// Middlewares
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (isOriginAllowed(origin)) return callback(null, true);
      console.warn(`[CORS Blocked] Origin: ${origin}`);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// userRoutes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
// adminRoutes
app.use(
  "/api/admin",
  getRevenueInfo,
  adminRoutes,
  adminAccountRoutes,
  adminNotificationRoutes,
  planRoutes,
  addonRoutes,
  dashboardRoutes,
  auditLogRoutes,
  adminSubscriptionRoutes
);

app.use("/api/admin", adminBlogRoutes);
app.use("/api/admin/analytics", adminAnalyticsRoutes); // NEW Analytics Route

app.use("/api/escalation", escalationChats);
app.use("/api/subscriptions", planDetails);

app.use("/api/addon", addonOrders);

// Browse listings & individual posts without active subscription.
// Expired users can VIEW posts/jobs but cannot create/update/delete them.
const providerListingRouter = Router();
providerListingRouter.get("/allProviderPosts", apiLimiter, getAllProviderPosts);
providerListingRouter.get("/allPosts", apiLimiter, getPostsController);
providerListingRouter.get("/myPosts", apiLimiter, getMyProviderPosts);       // own posts — no sub required to view
providerListingRouter.get("/getby/:id", getPostsByIdController);              // single post detail — no sub required

const seekerListingRouter = Router();
seekerListingRouter.get("/allSeekerPosts", apiLimiter, seekerPostController.getAllPosts);
seekerListingRouter.get("/allposts", apiLimiter, seekerPostController.getPosts);
seekerListingRouter.get("/myposts", apiLimiter, seekerPostController.getMyPosts);  // own posts — no sub required to view
seekerListingRouter.get("/getby/:id", seekerPostController.getPostById);           // single job detail — no sub required

app.use("/api/provider", authenticate, providerListingRouter);
app.use("/api/seeker", authenticate, seekerListingRouter);

app.use("/api/provider", authenticate, requireActiveSubscription, providerRoutes, providerDashRoutes);

app.use("/api/seeker", authenticate, requireActiveSubscription, seekerRoutes);

// Search API
app.use("/api/search", authenticate, requireActiveSubscription, searchRoutes);

// Matching API — Seeker Req. <-> Provider Bench
app.use("/api/matching", matchingRoutes);

app.use("/api/application", applicationRoutes);


app.use("/api/storage", bucketRoutes);

app.use("/api/deal", dealRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/webhook", razorpayWebhookRoutes);


app.use("/api/admin/deals", adminDealRoutes);

app.use("/api/notifications", notificationRoutes);


app.use("/api/chat", chatRoutes);

// Support Query System
app.use("/api/support", supportRoutes);

// Blog System (Public)
app.use("/api/blogs", publicBlogRoutes);

// Public Post Listings
const publicRouter = Router();
publicRouter.get("/provider/posts", apiLimiter, getAllProviderPosts);
publicRouter.get("/seeker/posts", apiLimiter, seekerPostController.getAllPosts);
app.use("/api/public", publicRouter);


// Push Notifications
app.use("/api/push", userPushRoutes);
app.use("/api/admin/push", adminPushRoutes);

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date() });
});

app.get("/api/health/db", async (_req: Request, res: Response) => {
  const health = await dbHealthCheck();
  res.status(health.status === "healthy" ? 200 : 503).json(health);
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (isOriginAllowed(origin)) return callback(null, true);
      console.warn(`[Socket CORS Blocked] Origin: ${origin}`);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  },
});

io.use((socket, next) => {
  try {
    const raw =
      socket.handshake.auth?.token ||
      (socket.handshake.headers.authorization || "").split(" ")[1];

    if (!raw) return next(new Error("Unauthorized"));

    const payload = jwt.verify(raw, process.env.JWT_SECRET! ) as { userId: string; role: string };
    (socket as any).user = { id: payload.userId, role: payload.role };
    next();
  } catch (err) {
    next(new Error("Unauthorized"));
  }
});



export default io;


setupSocket( io);
setupEscalationChat(io);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: "Route not found" });
});

app.use(globalErrorHandler);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT,() => {
  console.log(`BenchXchange backend running on port ${PORT}`);
});