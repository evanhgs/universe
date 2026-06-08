import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { Prisma, PrismaClient } from "../generated/prisma/client";
import type { MainGenres, Moods, Tags, UsageTags } from "../generated/prisma/enums";

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
const seedGenres = ["TRAP", "DRILL", "R_AND_B", "AFRO", "POP", "BOOM_BAP"] as const satisfies MainGenres[];
const seedMoods = ["DARK", "MELOANCHOLIC", "CLUB", "SAD", "ENERGETIC", "DREAMY"] as const satisfies Moods[];
const seedKeys = ["Am", "Cm", "Dm", "Em", "F#m", "Gm"] as const;
const benchmarkGenres = [
  "TRAP",
  "DRILL",
  "R_AND_B",
  "AFRO",
  "POP",
  "BOOM_BAP",
  "JERSEY_CLUB",
  "DANCEHALL",
  "AMAPIANO",
  "HIP_HOP",
  "REGGAETON",
  "HOUSE",
] as const satisfies MainGenres[];
const benchmarkMoods = [
  "DARK",
  "MELOANCHOLIC",
  "CLUB",
  "SAD",
  "ENERGETIC",
  "DREAMY",
  "AGGRESSIVE",
  "CHILL",
  "ROMANTIC",
  "CINEMATIC",
] as const satisfies Moods[];
const benchmarkTags = [
  "INSTRUMENTS_808",
  "PIANO",
  "GUITAR",
  "SAMPLE",
  "PUNCHY",
  "SOFT",
  "BOUNCY",
  "SYNTH",
  "CHOIR",
  "BASS",
  "WARM",
  "ANALOG",
  "CLEAN",
  "WIDE",
] as const satisfies Tags[];
const benchmarkUsageTags = [
  "TYPE_BEAT",
  "FREESTYLE",
  "CLUB",
  "RADIO",
  "YOUTUBE",
  "TIKTOK",
] as const satisfies UsageTags[];

const SEED_MODE = process.env.SEED_MODE ?? "demo";
const BENCHMARK_SESSION_PREFIX = "seed-benchmark";
const BENCHMARK_AUDIO_PREVIEW_BUCKET =
  optionalEnv("SEED_AUDIO_BUCKET") ??
  optionalEnv("SEED_BENCHMARK_AUDIO_BUCKET") ??
  "universe-dev-beats";
const BENCHMARK_AUDIO_PREVIEW_OBJECT_KEY =
  optionalEnv("SEED_AUDIO_OBJECT_KEY") ??
  optionalEnv("SEED_BENCHMARK_AUDIO_OBJECT_KEY") ??
  "beats/preview/cmq0u0zl9000g0uqxdp5xl2x4/46af5656-6649-4e84-9563-1206b6b20859.mp3";
const BENCHMARK_CONFIG = {
  sellerCount: parsePositiveIntegerEnv(["SEED_SELLER_COUNT", "SEED_BENCHMARK_SELLER_COUNT"], 40),
  buyerCount: parsePositiveIntegerEnv(["SEED_BUYER_COUNT", "SEED_BENCHMARK_BUYER_COUNT"], 8),
  beatCount: parsePositiveIntegerEnv(["SEED_BEAT_COUNT", "SEED_BENCHMARK_BEAT_COUNT"], 500),
  eventCount: parsePositiveIntegerEnv(
    ["SEED_ANALYTICS_EVENTS", "SEED_BENCHMARK_EVENT_COUNT"],
    50_000,
  ),
  randomSeed: parsePositiveIntegerEnv(["SEED_RANDOM_SEED", "SEED_BENCHMARK_RANDOM_SEED"], 20260605),
} as const;

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const usernamePattern = /^[a-z0-9]+(?:-[a-z0-9_]+)*$/;

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();

  return value ? value : undefined;
}

function parsePositiveIntegerEnv(names: string | string[], fallback: number) {
  const envNames = Array.isArray(names) ? names : [names];
  const name = envNames.find((envName) => process.env[envName] !== undefined) ?? envNames[0];
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomInt(random: () => number, min: number, max: number) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function randomFloat(random: () => number, min: number, max: number) {
  return min + random() * (max - min);
}

function pickRandomValue<T>(random: () => number, values: readonly T[]) {
  return values[Math.floor(random() * values.length)];
}

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
  bucket?: string;
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
      bucket: input.bucket ?? "public",
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
      bucket: input.bucket ?? "public",
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
    const tag = pickSeedValue(benchmarkTags, index);
    const usageTag = pickSeedValue(benchmarkUsageTags, index);
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
        mainGenres: [genre],
        secondGenres: [],
        moods: [mood],
        tags: [tag],
        usageTags: [usageTag],
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
        mainGenres: [genre],
        secondGenres: [],
        moods: [mood],
        tags: [tag],
        usageTags: [usageTag],
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
          assetId: previewAsset.id,
          role: "AUDIO_PREVIEW",
          licenseOfferingId: offering.id,
          sortOrder: 0,
        },
      ],
    });
  }
}

function benchmarkSellerEmail(index: number) {
  return `benchmark-seller-${String(index + 1).padStart(2, "0")}@universe.local`;
}

function benchmarkBuyerEmail(index: number) {
  return `benchmark-buyer-${String(index + 1).padStart(2, "0")}@universe.local`;
}

function benchmarkSellerSlug(index: number) {
  return `benchmark-seller-${String(index + 1).padStart(2, "0")}`;
}

function benchmarkBuyerSlug(index: number) {
  return `benchmark-buyer-${String(index + 1).padStart(2, "0")}`;
}

function benchmarkBeatSlug(index: number) {
  return `benchmark-beat-${String(index + 1).padStart(4, "0")}`;
}

function benchmarkBeatTitle(index: number, genre: string, mood: string, tags: string[]) {
  return `${genre} ${mood} ${tags[0] ?? "Wave"} ${String(index + 1).padStart(4, "0")}`;
}

async function upsertBenchmarkUser(input: {
  email: string;
  username: string;
  clerkUserId: string;
  displayName: string;
  slug: string;
  bio: string;
  roles: Array<"BUYER" | "SELLER">;
}) {
  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: {
      clerkUserId: input.clerkUserId,
      username: input.username,
      firstName: input.displayName.split(" ")[0] ?? "Benchmark",
      lastName: input.displayName.split(" ").slice(1).join(" ") || null,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
    create: {
      clerkUserId: input.clerkUserId,
      email: input.email,
      username: input.username,
      firstName: input.displayName.split(" ")[0] ?? "Benchmark",
      lastName: input.displayName.split(" ").slice(1).join(" ") || null,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
    select: { id: true, email: true, clerkUserId: true },
  });

  await prisma.userRoleAssignment.createMany({
    data: input.roles.map((role) => ({ userId: user.id, role })),
    skipDuplicates: true,
  });

  await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: {
      displayName: input.displayName,
      slug: input.slug,
      bio: input.bio,
      countryCode: "FR",
      city: "Paris",
      isPublic: true,
    },
    create: {
      userId: user.id,
      displayName: input.displayName,
      slug: input.slug,
      bio: input.bio,
      countryCode: "FR",
      city: "Paris",
      isPublic: true,
    },
  });

  return user;
}

async function seedBenchmarkSellers(random: () => number) {
  const sellers = [];

  for (let index = 0; index < BENCHMARK_CONFIG.sellerCount; index += 1) {
    const seller = await upsertBenchmarkUser({
      email: benchmarkSellerEmail(index),
      username: benchmarkSellerSlug(index),
      clerkUserId: `user_seed_benchmark_seller_${index + 1}`,
      displayName: `Benchmark Seller ${String(index + 1).padStart(2, "0")}`,
      slug: benchmarkSellerSlug(index),
      bio: "Vendeur synthetique pour tester le scoring organique Universe.",
      roles: ["SELLER"],
    });
    const salesCount = Math.max(0, Math.round(Math.pow(random(), 2.2) * 240));
    const averageRating = Math.round(randomFloat(random, 3.2, 5) * 100) / 100;
    const responseRate = Math.round(randomFloat(random, 0.45, 0.99) * 10_000) / 10_000;
    const disputeRate = Math.round(Math.pow(random(), 3) * 0.12 * 10_000) / 10_000;

    await prisma.sellerStats.upsert({
      where: { sellerId: seller.id },
      create: {
        sellerId: seller.id,
        salesCount,
        averageRating,
        responseRate,
        successfulOrders: Math.max(0, Math.round(salesCount * randomFloat(random, 0.72, 0.98))),
        disputeRate,
      },
      update: {
        salesCount,
        averageRating,
        responseRate,
        successfulOrders: Math.max(0, Math.round(salesCount * randomFloat(random, 0.72, 0.98))),
        disputeRate,
      },
    });

    sellers.push(seller);
  }

  return sellers;
}

async function seedBenchmarkBuyers() {
  const tasteProfiles = [
    {
      slug: "trap-drill",
      genres: { trap: 1, drill: 0.9, jersey: 0.35 },
      moods: { dark: 1, aggressive: 0.75, energetic: 0.45 },
      tags: { "808": 1, piano: 0.8, dark: 0.7, freestyle: 0.55 },
      bpm: [130, 155] as const,
    },
    {
      slug: "afro-club",
      genres: { afro: 1, amapiano: 0.85, dancehall: 0.65 },
      moods: { club: 1, energetic: 0.8, romantic: 0.45 },
      tags: { summer: 1, bounce: 0.8, club: 0.75, latin: 0.4 },
      bpm: [95, 125] as const,
    },
    {
      slug: "rnb-melodic",
      genres: { "r&b": 1, pluggnb: 0.8, pop: 0.45 },
      moods: { melodic: 1, romantic: 0.75, dreamy: 0.7 },
      tags: { guitar: 1, smooth: 0.85, melodic: 0.8, soul: 0.65 },
      bpm: [70, 105] as const,
    },
    {
      slug: "boombap-sample",
      genres: { "boom bap": 1, trap: 0.25 },
      moods: { chill: 0.85, cinematic: 0.5, dark: 0.35 },
      tags: { sample: 1, piano: 0.65, soul: 0.8, street: 0.6 },
      bpm: [82, 102] as const,
    },
  ];
  const buyers = [];

  for (let index = 0; index < BENCHMARK_CONFIG.buyerCount; index += 1) {
    const taste = tasteProfiles[index % tasteProfiles.length];
    const buyer = await upsertBenchmarkUser({
      email: benchmarkBuyerEmail(index),
      username: benchmarkBuyerSlug(index),
      clerkUserId: `user_seed_benchmark_buyer_${index + 1}`,
      displayName: `Benchmark Buyer ${String(index + 1).padStart(2, "0")}`,
      slug: benchmarkBuyerSlug(index),
      bio: `Acheteur synthetique ${taste.slug} pour tester la personnalisation FYP.`,
      roles: ["BUYER"],
    });

    await prisma.userTasteProfile.upsert({
      where: { userId: buyer.id },
      create: {
        userId: buyer.id,
        favoriteGenres: taste.genres,
        favoriteMoods: taste.moods,
        favoriteTags: taste.tags,
        preferredBpmMin: taste.bpm[0],
        preferredBpmMax: taste.bpm[1],
      },
      update: {
        favoriteGenres: taste.genres,
        favoriteMoods: taste.moods,
        favoriteTags: taste.tags,
        preferredBpmMin: taste.bpm[0],
        preferredBpmMax: taste.bpm[1],
      },
    });

    buyers.push({
      ...buyer,
      taste,
    });
  }

  return buyers;
}

function benchmarkBeatTags(random: () => number) {
  const tags = new Set<Tags>([
    pickRandomValue(random, benchmarkTags),
    pickRandomValue(random, benchmarkTags),
  ]);

  while (tags.size < 7) {
    tags.add(pickRandomValue(random, benchmarkTags));
  }

  return [...tags];
}

async function seedBenchmarkMediaAssets(ownerId: string) {
  const previewAsset = await upsertSeedMediaAsset({
    ownerId,
    bucket: BENCHMARK_AUDIO_PREVIEW_BUCKET,
    objectKey: BENCHMARK_AUDIO_PREVIEW_OBJECT_KEY,
    originalFilename: "test-preview.mp3",
    mimeType: "audio/mpeg",
    extension: "mp3",
    assetType: "AUDIO_PREVIEW",
    processingStatus: "READY",
    metadataJson: {
      generatedBy: "universe-audio-worker",
      durationSec: 3990,
      previewDurationSec: 30,
      bitrateKbps: 96,
      seedOnly: true,
      benchmark: true,
    },
  });

  return { previewAsset };
}

function benchmarkStats(random: () => number, index: number, publishedAt: Date) {
  const ageDays = Math.max(1, (Date.now() - publishedAt.getTime()) / (24 * 60 * 60 * 1000));
  const popularity = Math.pow(1 - (index % BENCHMARK_CONFIG.beatCount) / BENCHMARK_CONFIG.beatCount, 2.4);
  const freshnessBoost = ageDays <= 7 ? 0.45 : 0;
  const quality = Math.min(1, Math.max(0.05, popularity + freshnessBoost + randomFloat(random, -0.15, 0.25)));
  const impressions = Math.max(8, Math.round(40 + quality * 5200 + randomInt(random, 0, 260)));
  const plays = Math.round(impressions * randomFloat(random, 0.18, 0.72) * quality);
  const clicks = Math.round(impressions * randomFloat(random, 0.025, 0.16) * quality);
  const fullPlays = Math.round(plays * randomFloat(random, 0.08, 0.55) * quality);
  const skips = Math.round(plays * randomFloat(random, 0.04, 0.42) * (1.05 - quality));
  const likes = Math.round(fullPlays * randomFloat(random, 0.03, 0.24));
  const saves = Math.round(likes * randomFloat(random, 0.12, 0.55));
  const shares = Math.round(likes * randomFloat(random, 0.03, 0.22));
  const licenseClicks = Math.round(clicks * randomFloat(random, 0.04, 0.3));
  const addToCart = Math.round(licenseClicks * randomFloat(random, 0.06, 0.34));
  const purchases = Math.round(addToCart * randomFloat(random, 0.04, 0.38));
  const price = 19 + (index % 8) * 10;
  const revenue = purchases * price;

  return {
    impressions,
    clicks,
    plays,
    pauses: Math.round(plays * randomFloat(random, 0.03, 0.18)),
    skips,
    fullPlays,
    likes,
    saves,
    shares,
    licenseClicks,
    addToCart,
    purchases,
    revenue,
    conversionRate: impressions >= 100 ? purchases / impressions : 0,
  };
}

async function seedBenchmarkBeats(random: () => number, sellers: Array<{ id: string }>) {
  const basicLicenseTemplate = await ensureBasicLicenseTemplate();
  const media = await seedBenchmarkMediaAssets(sellers[0].id);
  const beats = [];

  for (let index = 0; index < BENCHMARK_CONFIG.beatCount; index += 1) {
    const seller = sellers[index % sellers.length];
    const genre = pickRandomValue(random, benchmarkGenres);
    const mood = pickRandomValue(random, benchmarkMoods);
    const tags = benchmarkBeatTags(random);
    const usageTags = [pickRandomValue(random, benchmarkUsageTags)];
    const publishedAt = new Date(Date.now() - randomInt(random, 0, 180) * 24 * 60 * 60 * 1000);
    const priceAmount = index % 19 === 0 ? 0 : 19 + (index % 8) * 10;
    const slug = benchmarkBeatSlug(index);
    const beat = await prisma.beat.upsert({
      where: { slug },
      update: {
        ownerId: seller.id,
        title: benchmarkBeatTitle(index, genre, mood, tags),
        description: `Benchmark V2 ${genre.toLowerCase()} ${mood.toLowerCase()} avec tags ${tags.slice(0, 4).join(", ")}.`,
        bpm: randomInt(random, 68, 168),
        musicalKey: pickRandomValue(random, seedKeys),
        durationSec: randomInt(random, 82, 190),
        basePriceAmount: priceAmount,
        currency: "EUR",
        mainGenres: [genre],
        secondGenres: [],
        moods: [mood],
        tags,
        usageTags,
        status: "PUBLISHED",
        visibility: "PUBLIC",
        moderationStatus: "CLEAN",
        isFree: priceAmount === 0,
        brandingRequired: priceAmount === 0,
        firstPublishedAt: publishedAt,
        publishedAt,
      },
      create: {
        ownerId: seller.id,
        slug,
        title: benchmarkBeatTitle(index, genre, mood, tags),
        description: `Benchmark V2 ${genre.toLowerCase()} ${mood.toLowerCase()} avec tags ${tags.slice(0, 4).join(", ")}.`,
        bpm: randomInt(random, 68, 168),
        musicalKey: pickRandomValue(random, seedKeys),
        durationSec: randomInt(random, 82, 190),
        basePriceAmount: priceAmount,
        currency: "EUR",
        mainGenres: [genre],
        secondGenres: [],
        moods: [mood],
        tags,
        usageTags,
        status: "PUBLISHED",
        visibility: "PUBLIC",
        moderationStatus: "CLEAN",
        isFree: priceAmount === 0,
        brandingRequired: priceAmount === 0,
        firstPublishedAt: publishedAt,
        publishedAt,
      },
      select: {
        id: true,
        ownerId: true,
        basePriceAmount: true,
        mainGenres: true,
        moods: true,
        tags: true,
        bpm: true,
        publishedAt: true,
      },
    });

    const offering = await prisma.beatLicenseOffering.upsert({
      where: {
        beatId_licenseTemplateId: {
          beatId: beat.id,
          licenseTemplateId: basicLicenseTemplate.id,
        },
      },
      update: {
        sellerId: seller.id,
        title: "MP3",
        description: "Licence benchmark pour tester la conversion.",
        priceAmount,
        currency: "EUR",
        isActive: true,
        isDefault: true,
      },
      create: {
        beatId: beat.id,
        licenseTemplateId: basicLicenseTemplate.id,
        sellerId: seller.id,
        title: "MP3",
        description: "Licence benchmark pour tester la conversion.",
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
          assetId: media.previewAsset.id,
          role: "AUDIO_PREVIEW",
          licenseOfferingId: offering.id,
          sortOrder: 0,
        },
      ],
    });

    const stats = benchmarkStats(random, index, publishedAt);

    await prisma.beatStats.upsert({
      where: { beatId: beat.id },
      create: {
        beatId: beat.id,
        ...stats,
      },
      update: stats,
    });

    beats.push({
      ...beat,
      stats,
      priceAmount,
    });
  }

  return beats;
}

function tasteAffinity(
  buyer: Awaited<ReturnType<typeof seedBenchmarkBuyers>>[number],
  beat: Awaited<ReturnType<typeof seedBenchmarkBeats>>[number],
) {
  const genres = buyer.taste.genres as unknown as Record<string, number>;
  const moods = buyer.taste.moods as unknown as Record<string, number>;
  const tags = buyer.taste.tags as unknown as Record<string, number>;
  const genreScore = Number(genres[beat.mainGenres[0]?.toLowerCase() ?? ""] ?? 0);
  const moodScore = Number(moods[beat.moods[0]?.toLowerCase() ?? ""] ?? 0);
  const tagScore = beat.tags.reduce(
    (score, tag) => score + Number(tags[tag.toLowerCase()] ?? 0),
    0,
  );
  const bpmScore =
    beat.bpm && beat.bpm >= buyer.taste.bpm[0] && beat.bpm <= buyer.taste.bpm[1] ? 0.65 : 0;

  return Math.min(1, genreScore * 0.35 + moodScore * 0.25 + tagScore * 0.08 + bpmScore);
}

function weightedBenchmarkEventType(random: () => number, affinity: number) {
  const roll = random();
  const positiveBoost = affinity * 0.08;

  if (roll < 0.48 - positiveBoost) return "BEAT_IMPRESSION" as const;
  if (roll < 0.67 - positiveBoost) return "BEAT_PLAY" as const;
  if (roll < 0.75 - positiveBoost) return "BEAT_SKIP" as const;
  if (roll < 0.82) return "BEAT_FULL_PLAY" as const;
  if (roll < 0.89) return "BEAT_LIKE" as const;
  if (roll < 0.93) return "BEAT_SAVE" as const;
  if (roll < 0.96) return "LICENSE_CLICK" as const;
  if (roll < 0.985) return "ADD_TO_CART" as const;

  return "PURCHASE" as const;
}

function benchmarkEventTiming(random: () => number) {
  return new Date(Date.now() - randomInt(random, 0, 30 * 24 * 60 * 60 * 1000));
}

async function deletePreviousBenchmarkEvents() {
  await prisma.analyticsEvent.deleteMany({
    where: {
      sessionId: { startsWith: BENCHMARK_SESSION_PREFIX },
    },
  });
}

async function createBenchmarkEvents(
  random: () => number,
  buyers: Awaited<ReturnType<typeof seedBenchmarkBuyers>>,
  beats: Awaited<ReturnType<typeof seedBenchmarkBeats>>,
) {
  await deletePreviousBenchmarkEvents();

  const rows: Prisma.AnalyticsEventCreateManyInput[] = [];

  for (let index = 0; index < BENCHMARK_CONFIG.eventCount; index += 1) {
    const buyer = pickRandomValue(random, buyers);
    const candidate = pickRandomValue(random, beats);
    const affinity = tasteAffinity(buyer, candidate);
    const eventType = weightedBenchmarkEventType(random, affinity);
    const occurredAt = benchmarkEventTiming(random);
    const isAnonymous = random() < 0.22;
    const durationMs = eventType === "BEAT_IMPRESSION" ? null : randomInt(random, 800, 160_000);
    const playPercentage =
      eventType === "BEAT_FULL_PLAY" || eventType === "PURCHASE"
        ? randomFloat(random, 0.85, 1)
        : eventType === "BEAT_SKIP"
          ? randomFloat(random, 0.01, 0.24)
          : randomFloat(random, 0.12, 0.84);

    rows.push({
      type: eventType,
      beatId: candidate.id,
      sellerId: candidate.ownerId,
      userId: isAnonymous ? null : buyer.id,
      sessionId: `${BENCHMARK_SESSION_PREFIX}-${isAnonymous ? "anon" : buyer.id}-${index % 32}`,
      source: pickRandomValue(random, ["feed", "search", "profile", "similar", "trending"] as const),
      durationMs: durationMs ?? undefined,
      watchMs: durationMs ?? undefined,
      playPercentage,
      metadataJson:
        eventType === "PURCHASE"
          ? {
              revenue: candidate.priceAmount,
              benchmark: true,
              affinity,
            }
          : {
              benchmark: true,
              affinity,
            },
      occurredAt,
      createdAt: occurredAt,
    });
  }

  const chunkSize = 1_000;

  for (let index = 0; index < rows.length; index += chunkSize) {
    await prisma.analyticsEvent.createMany({
      data: rows.slice(index, index + chunkSize),
    });
  }

  return rows.length;
}

async function refreshBenchmarkSellerProfiles(sellers: Array<{ id: string }>) {
  await Promise.all(
    sellers.map(async (seller) => {
      const [beatCount, saleCount, sellerStats] = await Promise.all([
        prisma.beat.count({
          where: {
            ownerId: seller.id,
            status: "PUBLISHED",
            visibility: "PUBLIC",
          },
        }),
        prisma.beatStats.aggregate({
          where: {
            beat: {
              ownerId: seller.id,
            },
          },
          _sum: {
            purchases: true,
          },
        }),
        prisma.sellerStats.findUnique({
          where: { sellerId: seller.id },
          select: { averageRating: true },
        }),
      ]);

      await prisma.userProfile.updateMany({
        where: { userId: seller.id },
        data: {
          beatCount,
          saleCount: saleCount._sum.purchases ?? 0,
          sellerRatingAvg: sellerStats?.averageRating,
          sellerRatingCount: Math.max(0, Math.round((saleCount._sum.purchases ?? 0) * 0.18)),
          followerCount: Math.max(0, Math.round(beatCount * 3.4)),
        },
      });
    }),
  );
}

async function seedBenchmarkDataset() {
  const random = createSeededRandom(BENCHMARK_CONFIG.randomSeed);
  const sellers = await seedBenchmarkSellers(random);
  const buyers = await seedBenchmarkBuyers();
  const beats = await seedBenchmarkBeats(random, sellers);
  const eventCount = await createBenchmarkEvents(random, buyers, beats);

  await refreshBenchmarkSellerProfiles(sellers);

  return {
    sellerCount: sellers.length,
    buyerCount: buyers.length,
    beatCount: beats.length,
    eventCount,
  };
}

const pool = new Pool({
  connectionString: getDatabaseUrl(),
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

async function main() {
  if (SEED_MODE === "benchmark") {
    const benchmark = await seedBenchmarkDataset();

    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "benchmark",
          config: BENCHMARK_CONFIG,
          seededBenchmark: benchmark,
          exampleCommands: {
            anonymousFeed: "/api/feed?limit=20&sessionId=seed-benchmark-manual",
            trapUserClerkId: "user_seed_benchmark_buyer_1",
            afroUserClerkId: "user_seed_benchmark_buyer_2",
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  if (SEED_MODE !== "demo") {
    throw new Error(`Unsupported SEED_MODE "${SEED_MODE}". Use "demo" or "benchmark".`);
  }

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
