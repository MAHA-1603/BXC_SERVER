const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixMissingFields() {
  try {
    console.log("🚀 Starting data fix script...");

    // 1. Fix Plans
    console.log("Checking Plans...");
    const plans = await prisma.plan.findRaw({});
    console.log(`Found ${plans.length} plans.`);

    for (const plan of plans) {
      if (!plan.countryCode) {
        const id = plan._id.$oid;
        console.log(`Updating Plan: ${plan.title || id} -> Setting countryCode: INDIA`);
        
        // We use updateMany with a specific ID to avoid serialization issues
        await prisma.plan.updateMany({
          where: { id: id },
          data: { countryCode: 'INDIA' }
        });
      }
    }

    // 2. Fix Users (optional but recommended)
    console.log("Checking Users...");
    // Just a sample check for a few users
    const userCount = await prisma.user.count();
    console.log(`Total users: ${userCount}`);
    
    // We can run a bulk update for users who might be missing verificationStatus or mode
    const userUpdate = await prisma.user.updateMany({
      where: { verificationStatus: { is: null } },
      data: { verificationStatus: 'PENDING' }
    });
    console.log(`Updated ${userUpdate.count} users with missing verificationStatus.`);

    const modeUpdate = await prisma.user.updateMany({
      where: { mode: { is: null } },
      data: { mode: 'SEEKER' }
    });
    console.log(`Updated ${modeUpdate.count} users with missing mode.`);

    console.log("✅ Data fix complete!");

  } catch (error) {
    console.error("❌ Error during data fix:", error);
  } finally {
    await prisma.$disconnect();
  }
}

fixMissingFields();
