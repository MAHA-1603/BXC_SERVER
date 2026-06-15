import { prisma } from "../config/database";

// Generate a 12-digit numeric ticket ID
const generateTicketId = async (): Promise<string> => {
  let ticketId = "";
  let isUnique = false;
  
  while (!isUnique) {
    // Generate 12 random digits
    ticketId = "TKT" + Math.floor(Math.random() * 1000000000000).toString().padStart(12, "0");
    
    // Check for uniqueness in the database
    const existing = await prisma.supportQuery.findFirst({
      where: { ticketId },
    });
    
    if (!existing) {
      isUnique = true;
    }
  }
  
  return ticketId;
};

async function migrate() {
  console.log("Starting aggressive migration for support ticket IDs...");
  
  // Fetch ALL queries
  const allQueries = await prisma.supportQuery.findMany();
  console.log(`Checking ${allQueries.length} total queries...`);
  
  let updatedCount = 0;
  for (const query of allQueries) {
    // If ticketId is null, undefined, or empty string
    if (!query.ticketId) {
      const newTicketId = await generateTicketId();
      await prisma.supportQuery.update({
        where: { id: query.id },
        data: { ticketId: newTicketId }
      });
      console.log(`Updated query ${query.id} with ticketId: ${newTicketId}`);
      updatedCount++;
    } else {
      console.log(`Query ${query.id} already has ticketId: ${query.ticketId}`);
    }
  }
  
  console.log(`Migration completed! Managed to update ${updatedCount} records.`);
}

migrate()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
