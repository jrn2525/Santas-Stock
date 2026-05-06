import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";

  if (!email || !password) {
    console.error(
      "Missing SEED_ADMIN_EMAIL and/or SEED_ADMIN_PASSWORD in environment.\n" +
        "Add them to .env, then re-run `npm run db:seed`.",
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      role: Role.ADMIN,
      active: true,
      passwordHash,
    },
    create: {
      email,
      name,
      role: Role.ADMIN,
      active: true,
      passwordHash,
    },
  });

  console.log(`✓ Admin user ready: ${admin.email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
