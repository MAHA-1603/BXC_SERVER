const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkPlans() {
  try {
    console.log("Checking Plan collection using raw query...");
    // findRaw bypasses Prisma's model validation/serialization
    const plans = await prisma.plan.findRaw({});
    console.log("Plans found in DB:", JSON.stringify(plans, null, 2));
    
    if (!Array.isArray(plans) || plans.length === 0) {
      console.log("⚠️ No plans found in the database.");
    } else {
      plans.forEach((p, i) => {
        if (!p.countryCode) {
          console.log(`❌ Plan ${i + 1} (${p.title || p._id.$oid}) is missing 'countryCode'. THIS IS THE CAUSE OF THE CRASH.`);
        } else {
          console.log(`✅ Plan ${i + 1} has countryCode: ${p.countryCode}`);
        }
      });
    }
  } catch (error) {
    console.error("Error fetching plans:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPlans();
