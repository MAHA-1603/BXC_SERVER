import { PrismaClient } from "@prisma/client";

// Use a global variable to prevent multiple instances in development (hot reload)
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === "production"
        ? ["warn", "error"] // Only warnings and errors in production
        : ["query", "info", "warn", "error"], // Full logging in dev
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Graceful shutdown
const shutdown = async () => {
  try {
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
};

// Handle termination signals
process.on("SIGINT", shutdown); // CTRL+C
process.on("SIGTERM", shutdown); // Kubernetes, Docker stop

// Optional: database connection retry logic
export const connectWithRetry = async (retries = 5, delay = 3000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$connect();
      break;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((res) => setTimeout(res, delay));
    }
  }
};


// Add this function to your existing prisma file
export const dbHealthCheck = async () => {
  try {
    // MongoDB ping command (fastest health check)
    await prisma.$runCommandRaw({ ping: 1 });
    
    return { 
      status: 'healthy' as const, 
      db: 'connected', 
      latency: 'low',
      timestamp: new Date().toISOString() 
    };
  } catch (error) {
    console.error('DB health check failed:', error);
    return { 
      status: 'unhealthy' as const, 
      db: 'disconnected', 
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString() 
    };
  }
};


