import { prisma } from "../config/database";

async function diagnose() {
  console.log("Checking all support queries...");
  const allQueries = await prisma.supportQuery.findMany();
  console.log(`Total queries found: ${allQueries.length}`);
  
  allQueries.forEach((q, index) => {
    console.log(`[${index}] ID: ${q.id}, ticketId: "${q.ticketId}" (${typeof q.ticketId})`);
  });

  const nullRecords = allQueries.filter(q => q.ticketId === null || q.ticketId === undefined);
  console.log(`\nFound ${nullRecords.length} records with NULL or UNDEFINED ticketId.`);
}

diagnose()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
