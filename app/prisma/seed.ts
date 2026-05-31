import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { Prisma, PrismaClient } from "../generated/prisma/client";

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

const SEED_BEAT_COUNT = 30;
const seedGenres = ["Trap", "Drill", "R&B", "Afro", "Pop", "Boom bap"] as const;
const seedMoods = ["Dark", "Melodic", "Club", "Sad", "Energetic", "Dreamy"] as const;
const seedKeys = ["Am", "Cm", "Dm", "Em", "F#m", "Gm"] as const;
const seedThumbnailObjectKeys = ["globe.svg", "window.svg", "file.svg", "next.svg", "vercel.svg"] as const;

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

function pickSeedValue<T>(values: readonly T[], index: number) {
  return values[index % values.length];
}

function seedBeatSlug(index: number) {
  return `seed-feed-beat-${index + 1}`;
}

function seedBeatTitle(index: number) {
  const genre = pickSeedValue(seedGenres, index);
  const mood = pickSeedValue(seedMoods, index + 2);

  return `${genre} ${mood} ${String(index + 1).padStart(2, "0")}`;
}

async function ensureBasicLicenseTemplate() {
  return prisma.licenseTemplate.upsert({
    where: { code: "basic" },
    update: { isActive: true },
    create: {
      code: "basic",
      name: "MP3",
      scope: "BASIC",
      description: "Licence avec fichier MP3.",
      allowStreaming: true,
      allowCommercialUse: true,
      isSystem: true,
      isActive: true,
    },
    select: { id: true },
  });
}

async function upsertSeedMediaAsset(input: {
  ownerId: string;
  objectKey: string;
  originalFilename: string;
  mimeType: string;
  extension: string;
  assetType: "IMAGE_THUMBNAIL" | "AUDIO_PREVIEW";
  processingStatus?: "READY" | "PENDING";
  metadataJson?: Prisma.InputJsonValue;
}) {
  return prisma.mediaAsset.upsert({
    where: { objectKey: input.objectKey },
    update: {
      ownerId: input.ownerId,
      provider: "S3",
      bucket: "public",
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      extension: input.extension,
      assetType: input.assetType,
      processingStatus: input.processingStatus ?? "READY",
      isPublic: true,
      metadataJson: input.metadataJson,
    },
    create: {
      ownerId: input.ownerId,
      provider: "S3",
      bucket: "public",
      objectKey: input.objectKey,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      extension: input.extension,
      assetType: input.assetType,
      processingStatus: input.processingStatus ?? "READY",
      isPublic: true,
      metadataJson: input.metadataJson,
    },
    select: { id: true },
  });
}

async function seedFeedBeats(ownerId: string) {
  const basicLicenseTemplate = await ensureBasicLicenseTemplate();
  const thumbnailAssets = await Promise.all(
    seedThumbnailObjectKeys.map((objectKey) =>
      upsertSeedMediaAsset({
        ownerId,
        objectKey,
        originalFilename: objectKey,
        mimeType: "image/svg+xml",
        extension: "svg",
        assetType: "IMAGE_THUMBNAIL",
      }),
    ),
  );
  const previewAsset = await upsertSeedMediaAsset({
    ownerId,
    objectKey: "seed/feed/preview.mp3",
    originalFilename: "seed-feed-preview.mp3",
    mimeType: "audio/mpeg",
    extension: "mp3",
    assetType: "AUDIO_PREVIEW",
    processingStatus: "PENDING",
    metadataJson: {
      generatedBy: "universe-audio-worker",
      seedOnly: true,
    },
  });

  for (let index = 0; index < SEED_BEAT_COUNT; index += 1) {
    const slug = seedBeatSlug(index);
    const genre = pickSeedValue(seedGenres, index);
    const mood = pickSeedValue(seedMoods, index + 1);
    const publishedAt = new Date(Date.now() - index * 60 * 60 * 1000);
    const priceAmount = index % 7 === 0 ? 0 : 19 + (index % 6) * 10;

    const beat = await prisma.beat.upsert({
      where: { slug },
      update: {
        title: seedBeatTitle(index),
        description: `Beat de test pour le feed decouverte V2, ambiance ${mood.toLowerCase()}.`,
        bpm: 82 + ((index * 7) % 86),
        musicalKey: pickSeedValue(seedKeys, index),
        durationSec: 110 + ((index * 11) % 80),
        basePriceAmount: priceAmount,
        currency: "EUR",
        primaryGenre: genre,
        primaryMood: mood,
        tags: [genre.toLowerCase(), mood.toLowerCase(), `seed-${(index % 5) + 1}`],
        status: "PUBLISHED",
        visibility: "PUBLIC",
        moderationStatus: "CLEAN",
        isFree: priceAmount === 0,
        brandingRequired: priceAmount === 0,
        firstPublishedAt: publishedAt,
        publishedAt,
      },
      create: {
        ownerId,
        slug,
        title: seedBeatTitle(index),
        description: `Beat de test pour le feed decouverte V2, ambiance ${mood.toLowerCase()}.`,
        bpm: 82 + ((index * 7) % 86),
        musicalKey: pickSeedValue(seedKeys, index),
        durationSec: 110 + ((index * 11) % 80),
        basePriceAmount: priceAmount,
        currency: "EUR",
        primaryGenre: genre,
        primaryMood: mood,
        tags: [genre.toLowerCase(), mood.toLowerCase(), `seed-${(index % 5) + 1}`],
        status: "PUBLISHED",
        visibility: "PUBLIC",
        moderationStatus: "CLEAN",
        isFree: priceAmount === 0,
        brandingRequired: priceAmount === 0,
        firstPublishedAt: publishedAt,
        publishedAt,
      },
      select: { id: true },
    });

    const offering = await prisma.beatLicenseOffering.upsert({
      where: {
        beatId_licenseTemplateId: {
          beatId: beat.id,
          licenseTemplateId: basicLicenseTemplate.id,
        },
      },
      update: {
        sellerId: ownerId,
        title: "MP3",
        description: "Licence de test pour le feed.",
        priceAmount,
        currency: "EUR",
        isActive: true,
        isDefault: true,
      },
      create: {
        beatId: beat.id,
        licenseTemplateId: basicLicenseTemplate.id,
        sellerId: ownerId,
        title: "MP3",
        description: "Licence de test pour le feed.",
        priceAmount,
        currency: "EUR",
        isActive: true,
        isDefault: true,
      },
      select: { id: true },
    });

    await prisma.beatAssetLink.deleteMany({
      where: {
        beatId: beat.id,
        role: { in: ["IMAGE_THUMBNAIL", "AUDIO_PREVIEW"] },
      },
    });

    await prisma.beatAssetLink.createMany({
      data: [
        {
          beatId: beat.id,
          assetId: thumbnailAssets[index % thumbnailAssets.length].id,
          role: "IMAGE_THUMBNAIL",
          sortOrder: 0,
        },
        {
          beatId: beat.id,
          assetId: previewAsset.id,
          role: "AUDIO_PREVIEW",
          licenseOfferingId: offering.id,
          sortOrder: 1,
        },
      ],
    });
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

  await seedFeedBeats(user.id);

  await prisma.userProfile.update({
    where: { id: profile.id },
    data: {
      beatCount: await prisma.beat.count({
        where: {
          ownerId: user.id,
          status: "PUBLISHED",
          visibility: "PUBLIC",
        },
      }),
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
          seededFeedBeats: SEED_BEAT_COUNT,
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
