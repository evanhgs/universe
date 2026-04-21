import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "../generated/prisma/client";

const DEFAULT_SEED = {
  clerkUserId: process.env.SEED_CLERK_USER_ID ?? "user_seed_demo_v1",
  email: process.env.SEED_USER_EMAIL ?? "seed-seller@universe.local",
  username: process.env.SEED_USER_USERNAME ?? "seed-seller",
  firstName: process.env.SEED_USER_FIRST_NAME ?? "Seed",
  lastName: process.env.SEED_USER_LAST_NAME ?? "Seller",
  displayName: process.env.SEED_PROFILE_DISPLAY_NAME ?? "Seed Seller",
  slug: process.env.SEED_PROFILE_SLUG ?? "seed-seller",
  bio:
    process.env.SEED_PROFILE_BIO ??
    "Profil de depart pour brancher les premiers endpoints serveur.",
  countryCode: process.env.SEED_PROFILE_COUNTRY_CODE ?? "FR",
  city: process.env.SEED_PROFILE_CITY ?? "Paris",
} as const;

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const usernamePattern = /^[a-z0-9]+(?:-[a-z0-9_]+)*$/;

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run the seed.");
  }

  return databaseUrl;
}

function validateSeedConfig(seed: typeof DEFAULT_SEED) {
  if (!slugPattern.test(seed.slug)) {
    throw new Error(
      `Invalid SEED_PROFILE_SLUG "${seed.slug}". Use lowercase letters, numbers, and dashes only.`,
    );
  }

  if (!usernamePattern.test(seed.username)) {
    throw new Error(
      `Invalid SEED_USER_USERNAME "${seed.username}". Use lowercase letters, numbers, dashes, and underscores only.`,
    );
  }

  if (!seed.email.includes("@")) {
    throw new Error(`Invalid SEED_USER_EMAIL "${seed.email}".`);
  }
}

const pool = new Pool({
  connectionString: getDatabaseUrl(),
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

async function main() {
  validateSeedConfig(DEFAULT_SEED);

  const user = await prisma.user.upsert({
    where: {
      email: DEFAULT_SEED.email,
    },
    update: {
      clerkUserId: DEFAULT_SEED.clerkUserId,
      username: DEFAULT_SEED.username,
      firstName: DEFAULT_SEED.firstName,
      lastName: DEFAULT_SEED.lastName,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
    create: {
      clerkUserId: DEFAULT_SEED.clerkUserId,
      email: DEFAULT_SEED.email,
      username: DEFAULT_SEED.username,
      firstName: DEFAULT_SEED.firstName,
      lastName: DEFAULT_SEED.lastName,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });

  await prisma.userRoleAssignment.createMany({
    data: [
      { userId: user.id, role: "BUYER" },
      { userId: user.id, role: "SELLER" },
    ],
    skipDuplicates: true,
  });

  const profile = await prisma.userProfile.upsert({
    where: {
      userId: user.id,
    },
    update: {
      displayName: DEFAULT_SEED.displayName,
      slug: DEFAULT_SEED.slug,
      bio: DEFAULT_SEED.bio,
      countryCode: DEFAULT_SEED.countryCode,
      city: DEFAULT_SEED.city,
      isPublic: true,
    },
    create: {
      userId: user.id,
      displayName: DEFAULT_SEED.displayName,
      slug: DEFAULT_SEED.slug,
      bio: DEFAULT_SEED.bio,
      countryCode: DEFAULT_SEED.countryCode,
      city: DEFAULT_SEED.city,
      isPublic: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        seededUser: {
          userId: user.id,
          clerkUserId: user.clerkUserId,
          email: user.email,
          profileSlug: profile.slug,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
