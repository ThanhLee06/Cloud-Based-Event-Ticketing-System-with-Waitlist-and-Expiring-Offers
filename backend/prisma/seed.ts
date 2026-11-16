import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.appHealth.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  // TODO (ST-001 & ST-008): Bổ sung seed 100 synthetic students, Organizer, Admin và 8 sự kiện mẫu.
}

main()
  .catch((err) => {
    process.stderr.write(`Seed failed: ${String(err)}\n`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
