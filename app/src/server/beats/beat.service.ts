import "server-only";

import { syncCurrentAccountFromClerk } from "@/server/account/account.sync";
import { getPublicAssetUrl } from "@/server/storage/s3";

import type { AssetType } from "../../../generated/prisma/enums";
import {
  createBeat,
  findPublishedBeatPreviewBySlug,
  findPublishedBeats,
  findVisibleBeatBySlug,
  softDeleteBeatBySlug,
  updateBeatBySlug,
} from "./beat.repository";
import type { BeatApiPayload, BeatListQuery, CreateBeatInput, UpdateBeatInput } from "./beat.types";

type BeatRecord = Awaited<ReturnType<typeof createBeat>>;

function decimalToNumber(value: { toString(): string } | number | null) {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value.toString());
}

function bigintToNumber(value: bigint | number | null) {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value);
}

async function serializeBeat(beat: BeatRecord): Promise<BeatApiPayload> {
  return {
    id: beat.id,
    slug: beat.slug,
    title: beat.title,
    description: beat.description,
    bpm: beat.bpm,
    musicalKey: beat.musicalKey,
    durationSec: beat.durationSec,
    priceAmount: decimalToNumber(beat.basePriceAmount),
    currency: beat.currency,
    primaryGenre: beat.primaryGenre,
    primaryMood: beat.primaryMood,
    tags: beat.tags,
    status: beat.status,
    visibility: beat.visibility,
    isFree: beat.isFree,
    brandingRequired: beat.brandingRequired,
    firstPublishedAt: beat.firstPublishedAt?.toISOString() ?? null,
    publishedAt: beat.publishedAt?.toISOString() ?? null,
    createdAt: beat.createdAt.toISOString(),
    updatedAt: beat.updatedAt.toISOString(),
    seller: {
      id: beat.owner.id,
      slug: beat.owner.profile?.slug ?? null,
      displayName: beat.owner.profile?.displayName ?? null,
    },
    assets: await Promise.all(
      beat.assets.map(async ({ role, asset }) => ({
        id: asset.id,
        role: role as AssetType,
        bucket: asset.bucket,
        objectKey: asset.objectKey,
        url: await getPublicAssetUrl({
          bucket: asset.bucket,
          objectKey: asset.objectKey,
          isPublic: asset.isPublic,
        }),
        originalFilename: asset.originalFilename,
        mimeType: asset.mimeType,
        sizeBytes: bigintToNumber(asset.sizeBytes),
      })),
    ),
  };
}

async function assertSellerAccount(clerkUserId: string) {
  const account = await syncCurrentAccountFromClerk();

  if (account.clerkUserId !== clerkUserId) {
    throw new Error("account_not_found");
  }

  const roles = account.roles.map(({ role }) => role);

  if (!roles.includes("SELLER")) {
    throw new Error("seller_role_required");
  }

  return account;
}

export async function createBeatForCurrentSeller(clerkUserId: string, input: CreateBeatInput) {
  const account = await assertSellerAccount(clerkUserId);

  return serializeBeat(await createBeat(account.id, input));
}

export async function listPublishedBeatsPayload(query: BeatListQuery) {
  const beats = await findPublishedBeats(query);

  return Promise.all(beats.map(serializeBeat));
}

export async function getBeatPayloadBySlug(slug: string, viewerClerkUserId: string | null) {
  const result = await findVisibleBeatBySlug(slug, viewerClerkUserId);

  if (!result) {
    return null;
  }

  return {
    ...(await serializeBeat(result.beat)),
    viewer: {
      status: result.beat.status,
      visibility: result.beat.visibility,
      viewerCanEdit: result.viewerCanEdit,
    },
    licenseOfferings: result.beat.licenseOfferings.map((offering) => ({
      id: offering.id,
      title: offering.title,
      priceAmount: decimalToNumber(offering.priceAmount),
      currency: offering.currency,
    })),
  };
}

export async function getBeatPreviewPayloadBySlug(slug: string) {
  const beat = await findPublishedBeatPreviewBySlug(slug);
  const preview = beat?.assets[0]?.asset;

  if (!beat || !preview) {
    return null;
  }

  return {
    beat: {
      id: beat.id,
      slug: beat.slug,
      title: beat.title,
    },
    preview: {
      id: preview.id,
      bucket: preview.bucket,
      objectKey: preview.objectKey,
      url: await getPublicAssetUrl({
        bucket: preview.bucket,
        objectKey: preview.objectKey,
        isPublic: preview.isPublic,
      }),
      originalFilename: preview.originalFilename,
      mimeType: preview.mimeType,
      sizeBytes: bigintToNumber(preview.sizeBytes),
      delivery: "public_storage_reference" as const,
    },
  };
}

export async function updateBeatForCurrentSeller(
  clerkUserId: string,
  slug: string,
  input: UpdateBeatInput,
) {
  const account = await assertSellerAccount(clerkUserId);
  const beat = await updateBeatBySlug(account.id, slug, input);

  return beat ? serializeBeat(beat) : null;
}

export async function deleteBeatForCurrentSeller(clerkUserId: string, slug: string) {
  const account = await assertSellerAccount(clerkUserId);

  return softDeleteBeatBySlug(account.id, slug);
}

export async function listProfileBeatPayloads(profileSlug: string) {
  const beats = await findPublishedBeats({
    sellerSlug: profileSlug,
    sort: "newest",
    limit: 8,
  });

  return Promise.all(beats.map(serializeBeat));
}
