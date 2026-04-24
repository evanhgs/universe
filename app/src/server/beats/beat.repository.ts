import "server-only";

import { getPrisma } from "@/lib/prisma";

import type { AssetType } from "../../../generated/prisma/enums";
import {
  BEAT_SLUG_PATTERN,
  DEFAULT_BASIC_LICENSE_CODE,
} from "./beat.constants";
import type {
  BeatAssetInput,
  BeatListQuery,
  CreateBeatInput,
  UpdateBeatInput,
} from "./beat.types";

const beatInclude = {
  owner: {
    select: {
      id: true,
      clerkUserId: true,
      profile: {
        select: {
          slug: true,
          displayName: true,
        },
      },
    },
  },
  assets: {
    orderBy: {
      sortOrder: "asc" as const,
    },
    include: {
      asset: true,
    },
  },
} as const;

function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return BEAT_SLUG_PATTERN.test(normalized) ? normalized : "beat";
}

async function buildUniqueBeatSlug(title: string) {
  const prisma = getPrisma();
  const base = slugify(title);

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await prisma.beat.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!existing) {
      return slug;
    }
  }

  return `${base}-${Date.now()}`;
}

function mediaAssetCreate(ownerId: string, asset: BeatAssetInput, assetType: AssetType) {
  return {
    ownerId,
    provider: "OTHER" as const,
    bucket: asset.bucket,
    objectKey: asset.objectKey,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    extension: asset.extension,
    sizeBytes:
      asset.sizeBytes === null || asset.sizeBytes === undefined
        ? null
        : BigInt(asset.sizeBytes),
    checksumSha256: asset.checksumSha256,
    assetType,
    processingStatus: "READY" as const,
    isPublic: assetType === "IMAGE_THUMBNAIL" || assetType === "AUDIO_PREVIEW",
  };
}

async function ensureBasicLicenseTemplate() {
  return getPrisma().licenseTemplate.upsert({
    where: { code: DEFAULT_BASIC_LICENSE_CODE },
    update: { isActive: true },
    create: {
      code: DEFAULT_BASIC_LICENSE_CODE,
      name: "Basic",
      scope: "BASIC",
      description: "Licence de base pour une vente V1.",
      allowStreaming: true,
      allowCommercialUse: true,
      isSystem: true,
      isActive: true,
    },
    select: { id: true },
  });
}

async function refreshSellerBeatCount(userId: string) {
  const prisma = getPrisma();
  const beatCount = await prisma.beat.count({
    where: {
      ownerId: userId,
      status: "PUBLISHED",
      visibility: "PUBLIC",
    },
  });

  await prisma.userProfile.update({
    where: { userId },
    data: { beatCount },
  });
}

export async function createBeat(ownerId: string, input: CreateBeatInput) {
  const prisma = getPrisma();
  const slug = await buildUniqueBeatSlug(input.title);
  const licenseTemplate = await ensureBasicLicenseTemplate();
  const publishedAt = input.publish ? new Date() : null;

  const beat = await prisma.$transaction(async (tx) => {
    const createdBeat = await tx.beat.create({
      data: {
        ownerId,
        slug,
        title: input.title,
        description: input.description,
        bpm: input.bpm,
        musicalKey: input.musicalKey,
        basePriceAmount: input.priceAmount,
        currency: input.currency,
        primaryGenre: input.primaryGenre,
        primaryMood: input.primaryMood,
        tags: input.tags,
        status: input.publish ? "PUBLISHED" : "DRAFT",
        visibility: input.visibility,
        isFree: input.isFree,
        brandingRequired: input.brandingRequired,
        firstPublishedAt: publishedAt,
        publishedAt,
      },
      select: { id: true },
    });

    const offering = await tx.beatLicenseOffering.create({
      data: {
        beatId: createdBeat.id,
        licenseTemplateId: licenseTemplate.id,
        sellerId: ownerId,
        title: "Basic",
        priceAmount: input.priceAmount,
        currency: input.currency,
        isDefault: true,
      },
      select: { id: true },
    });

    const audioAsset = await tx.mediaAsset.create({
      data: mediaAssetCreate(ownerId, input.audioAsset, "AUDIO_SOURCE"),
      select: { id: true },
    });

    await tx.beatAssetLink.create({
      data: {
        beatId: createdBeat.id,
        assetId: audioAsset.id,
        role: "AUDIO_SOURCE",
        licenseOfferingId: offering.id,
      },
    });

    if (input.thumbnailAsset) {
      const thumbnailAsset = await tx.mediaAsset.create({
        data: mediaAssetCreate(ownerId, input.thumbnailAsset, "IMAGE_THUMBNAIL"),
        select: { id: true },
      });

      await tx.beatAssetLink.create({
        data: {
          beatId: createdBeat.id,
          assetId: thumbnailAsset.id,
          role: "IMAGE_THUMBNAIL",
          sortOrder: 1,
        },
      });
    }

    return tx.beat.findUniqueOrThrow({
      where: { id: createdBeat.id },
      include: beatInclude,
    });
  });

  await refreshSellerBeatCount(ownerId);

  return beat;
}

export async function findPublishedBeats(query: BeatListQuery) {
  return getPrisma().beat.findMany({
    where: {
      status: "PUBLISHED",
      visibility: "PUBLIC",
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
              { tags: { has: query.search.toLowerCase() } },
            ],
          }
        : {}),
      ...(query.genre
        ? { primaryGenre: { equals: query.genre, mode: "insensitive" } }
        : {}),
      ...(query.sellerSlug ? { owner: { profile: { slug: query.sellerSlug } } } : {}),
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: query.limit,
    include: beatInclude,
  });
}

export async function findVisibleBeatBySlug(slug: string, viewerClerkUserId: string | null) {
  const beat = await getPrisma().beat.findUnique({
    where: { slug },
    include: {
      ...beatInclude,
      licenseOfferings: {
        where: { isActive: true },
        orderBy: [{ isDefault: "desc" }, { priceAmount: "asc" }],
        select: {
          id: true,
          title: true,
          priceAmount: true,
          currency: true,
        },
      },
    },
  });

  if (!beat || beat.status === "DELETED") {
    return null;
  }

  const viewerCanEdit =
    viewerClerkUserId !== null && beat.owner.clerkUserId === viewerClerkUserId;

  if (!viewerCanEdit && (beat.status !== "PUBLISHED" || beat.visibility !== "PUBLIC")) {
    return null;
  }

  return { beat, viewerCanEdit };
}

export async function updateBeatBySlug(ownerId: string, slug: string, input: UpdateBeatInput) {
  const prisma = getPrisma();

  const existing = await prisma.beat.findUnique({
    where: { slug },
    select: { id: true, ownerId: true, firstPublishedAt: true },
  });

  if (!existing || existing.ownerId !== ownerId) {
    return null;
  }

  const publishedAt = input.status === "PUBLISHED" ? new Date() : undefined;
  const priceAmount = input.isFree ? 0 : input.priceAmount;

  const beat = await prisma.$transaction(async (tx) => {
    const updated = await tx.beat.update({
      where: { id: existing.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(priceAmount !== undefined ? { basePriceAmount: priceAmount } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.primaryGenre !== undefined ? { primaryGenre: input.primaryGenre } : {}),
        ...(input.primaryMood !== undefined ? { primaryMood: input.primaryMood } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.bpm !== undefined ? { bpm: input.bpm } : {}),
        ...(input.musicalKey !== undefined ? { musicalKey: input.musicalKey } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        ...(input.status !== undefined
          ? {
              status: input.status,
              publishedAt: input.status === "PUBLISHED" ? publishedAt : null,
              firstPublishedAt:
                input.status === "PUBLISHED" && !existing.firstPublishedAt
                  ? publishedAt
                  : undefined,
            }
          : {}),
        ...(input.isFree !== undefined ? { isFree: input.isFree } : {}),
        ...(input.brandingRequired !== undefined
          ? { brandingRequired: input.brandingRequired }
          : {}),
      },
      select: { id: true },
    });

    if (priceAmount !== undefined || input.currency !== undefined) {
      await tx.beatLicenseOffering.updateMany({
        where: {
          beatId: updated.id,
          isDefault: true,
        },
        data: {
          ...(priceAmount !== undefined ? { priceAmount } : {}),
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
        },
      });
    }

    if (input.audioAsset) {
      const audioAsset = await tx.mediaAsset.create({
        data: mediaAssetCreate(ownerId, input.audioAsset, "AUDIO_SOURCE"),
        select: { id: true },
      });

      await tx.beatAssetLink.deleteMany({
        where: { beatId: updated.id, role: "AUDIO_SOURCE" },
      });
      await tx.beatAssetLink.create({
        data: { beatId: updated.id, assetId: audioAsset.id, role: "AUDIO_SOURCE" },
      });
    }

    if (input.thumbnailAsset !== undefined) {
      await tx.beatAssetLink.deleteMany({
        where: { beatId: updated.id, role: "IMAGE_THUMBNAIL" },
      });

      if (input.thumbnailAsset) {
        const thumbnailAsset = await tx.mediaAsset.create({
          data: mediaAssetCreate(ownerId, input.thumbnailAsset, "IMAGE_THUMBNAIL"),
          select: { id: true },
        });

        await tx.beatAssetLink.create({
          data: {
            beatId: updated.id,
            assetId: thumbnailAsset.id,
            role: "IMAGE_THUMBNAIL",
            sortOrder: 1,
          },
        });
      }
    }

    return tx.beat.findUniqueOrThrow({
      where: { id: updated.id },
      include: beatInclude,
    });
  });

  await refreshSellerBeatCount(ownerId);

  return beat;
}

export async function softDeleteBeatBySlug(ownerId: string, slug: string) {
  const prisma = getPrisma();
  const beat = await prisma.beat.updateMany({
    where: {
      slug,
      ownerId,
      status: { not: "DELETED" },
    },
    data: {
      status: "DELETED",
      visibility: "PRIVATE",
      archivedAt: new Date(),
    },
  });

  await refreshSellerBeatCount(ownerId);

  return beat.count > 0;
}
