import "server-only";

import type { BeatStatus, LicenseScope, Visibility } from "../../../generated/prisma/enums";
import {
  DEFAULT_BEAT_CURRENCY,
  MAX_BEAT_TAGS,
} from "./beat.constants";
import type { BeatAssetInput, BeatListQuery, CreateBeatInput, UpdateBeatInput } from "./beat.types";

const allowedVisibility = new Set<Visibility>(["PUBLIC", "UNLISTED", "PRIVATE"]);
const allowedEditableStatuses = new Set<BeatStatus>(["DRAFT", "PUBLISHED", "HIDDEN", "ARCHIVED"]);
const allowedLicenseScopes = new Set<LicenseScope>([
  "BASIC",
  "PREMIUM",
  "UNLIMITED",
  "EXCLUSIVE",
  "CUSTOM",
]);
const allowedSorts = new Set<BeatListQuery["sort"]>([
  "newest",
  "price_asc",
  "price_desc",
  "bpm_asc",
  "bpm_desc",
]);

function normalizeOptionalString(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("Expected a string value.");
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

function requireString(value: unknown, field: string) {
  const normalized = normalizeOptionalString(value);

  if (!normalized) {
    throw new Error(`${field} is required.`);
  }

  return normalized;
}

function parseOptionalInteger(value: unknown, field: string, min: number, max: number) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}.`);
  }

  return parsed;
}

function parsePrice(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100000) {
    throw new Error("priceAmount must be a valid positive amount.");
  }

  return Math.round(parsed * 100) / 100;
}

function parseOptionalPrice(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100000) {
    throw new Error(`${field} must be a valid positive amount.`);
  }

  return Math.round(parsed * 100) / 100;
}

function parseCurrency(value: unknown) {
  const currency = normalizeOptionalString(value) ?? DEFAULT_BEAT_CURRENCY;

  if (!/^[A-Z]{3}$/.test(currency.toUpperCase())) {
    throw new Error("currency must be a 3-letter ISO code.");
  }

  return currency.toUpperCase();
}

function parseTags(value: unknown) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("tags must be an array.");
  }

  const tags = Array.from(
    new Set(
      value.map((tag) => {
        if (typeof tag !== "string") {
          throw new Error("tags must only contain strings.");
        }

        return tag.trim().toLowerCase();
      }).filter(Boolean),
    ),
  );

  if (tags.length > MAX_BEAT_TAGS) {
    throw new Error(`tags cannot contain more than ${MAX_BEAT_TAGS} values.`);
  }

  return tags;
}

function parseTagListParam(value: string | null) {
  if (!value) {
    return undefined;
  }

  const tags = Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  return tags.length > 0 ? tags.slice(0, MAX_BEAT_TAGS) : undefined;
}

function parseVisibility(value: unknown) {
  const visibility = (normalizeOptionalString(value) ?? "PUBLIC").toUpperCase() as Visibility;

  if (!allowedVisibility.has(visibility)) {
    throw new Error("visibility is invalid.");
  }

  return visibility;
}

function parseStatus(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const status = requireString(value, "status").toUpperCase() as BeatStatus;

  if (!allowedEditableStatuses.has(status)) {
    throw new Error("status is invalid.");
  }

  return status;
}

function parseLicenseType(value: string | null) {
  const licenseType = normalizeOptionalString(value)?.toUpperCase() as
    | LicenseScope
    | undefined;

  if (licenseType === undefined) {
    return undefined;
  }

  if (!allowedLicenseScopes.has(licenseType)) {
    throw new Error("licenseType is invalid.");
  }

  return licenseType;
}

function parseSort(value: string | null): BeatListQuery["sort"] {
  const sort = (normalizeOptionalString(value) ?? "newest").toLowerCase() as BeatListQuery["sort"];

  if (!allowedSorts.has(sort)) {
    throw new Error("sort is invalid.");
  }

  return sort;
}

function parseBoolean(value: unknown, defaultValue: boolean) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value !== "boolean") {
    throw new Error("Expected a boolean value.");
  }

  return value;
}

function parseAsset(value: unknown, field: string): BeatAssetInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }

  const body = value as Record<string, unknown>;
  const sizeBytes = parseOptionalInteger(body.sizeBytes, `${field}.sizeBytes`, 0, Number.MAX_SAFE_INTEGER);

  return {
    bucket: requireString(body.bucket, `${field}.bucket`),
    objectKey: requireString(body.objectKey, `${field}.objectKey`),
    originalFilename: normalizeOptionalString(body.originalFilename),
    mimeType: normalizeOptionalString(body.mimeType),
    extension: normalizeOptionalString(body.extension),
    sizeBytes,
    checksumSha256: normalizeOptionalString(body.checksumSha256),
  };
}

export function parseCreateBeatInput(payload: unknown): CreateBeatInput {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid beat payload.");
  }

  const body = payload as Record<string, unknown>;
  const title = requireString(body.title, "title");
  const priceAmount = parsePrice(body.priceAmount);
  const isFree = parseBoolean(body.isFree, priceAmount === 0);

  if (title.length > 140) {
    throw new Error("title is too long.");
  }

  return {
    title,
    description: normalizeOptionalString(body.description),
    priceAmount: isFree ? 0 : priceAmount,
    currency: parseCurrency(body.currency),
    primaryGenre: normalizeOptionalString(body.primaryGenre),
    primaryMood: normalizeOptionalString(body.primaryMood),
    tags: parseTags(body.tags),
    bpm: parseOptionalInteger(body.bpm, "bpm", 20, 300),
    musicalKey: normalizeOptionalString(body.musicalKey),
    visibility: parseVisibility(body.visibility),
    publish: parseBoolean(body.publish, false),
    isFree,
    brandingRequired: parseBoolean(body.brandingRequired, isFree),
    audioAsset: parseAsset(body.audioAsset, "audioAsset"),
    previewAsset:
      body.previewAsset === undefined || body.previewAsset === null
        ? null
        : parseAsset(body.previewAsset, "previewAsset"),
    thumbnailAsset:
      body.thumbnailAsset === undefined || body.thumbnailAsset === null
        ? null
        : parseAsset(body.thumbnailAsset, "thumbnailAsset"),
  };
}

export function parseUpdateBeatInput(payload: unknown): UpdateBeatInput {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid beat payload.");
  }

  const body = payload as Record<string, unknown>;
  const title = normalizeOptionalString(body.title);

  if (title === null) {
    throw new Error("title cannot be empty.");
  }

  if (title !== undefined && title.length > 140) {
    throw new Error("title is too long.");
  }

  return {
    ...(title !== undefined ? { title } : {}),
    ...(body.description !== undefined ? { description: normalizeOptionalString(body.description) } : {}),
    ...(body.priceAmount !== undefined ? { priceAmount: parsePrice(body.priceAmount) } : {}),
    ...(body.currency !== undefined ? { currency: parseCurrency(body.currency) } : {}),
    ...(body.primaryGenre !== undefined ? { primaryGenre: normalizeOptionalString(body.primaryGenre) } : {}),
    ...(body.primaryMood !== undefined ? { primaryMood: normalizeOptionalString(body.primaryMood) } : {}),
    ...(body.tags !== undefined ? { tags: parseTags(body.tags) } : {}),
    ...(body.bpm !== undefined ? { bpm: parseOptionalInteger(body.bpm, "bpm", 20, 300) } : {}),
    ...(body.musicalKey !== undefined ? { musicalKey: normalizeOptionalString(body.musicalKey) } : {}),
    ...(body.visibility !== undefined ? { visibility: parseVisibility(body.visibility) } : {}),
    ...(body.status !== undefined ? { status: parseStatus(body.status) } : {}),
    ...(body.isFree !== undefined ? { isFree: parseBoolean(body.isFree, false) } : {}),
    ...(body.brandingRequired !== undefined ? { brandingRequired: parseBoolean(body.brandingRequired, false) } : {}),
    ...(body.audioAsset !== undefined ? { audioAsset: parseAsset(body.audioAsset, "audioAsset") } : {}),
    ...(body.previewAsset !== undefined
      ? {
          previewAsset:
            body.previewAsset === null ? null : parseAsset(body.previewAsset, "previewAsset"),
        }
      : {}),
    ...(body.thumbnailAsset !== undefined
      ? {
          thumbnailAsset:
            body.thumbnailAsset === null ? null : parseAsset(body.thumbnailAsset, "thumbnailAsset"),
        }
      : {}),
  };
}

export function parseBeatListQuery(url: URL): BeatListQuery {
  const limit = Number(url.searchParams.get("limit") ?? 24);
  const bpm = parseOptionalInteger(url.searchParams.get("bpm"), "bpm", 20, 300);
  const bpmMin = parseOptionalInteger(url.searchParams.get("bpmMin"), "bpmMin", 20, 300);
  const bpmMax = parseOptionalInteger(url.searchParams.get("bpmMax"), "bpmMax", 20, 300);
  const priceMin = parseOptionalPrice(url.searchParams.get("priceMin"), "priceMin");
  const priceMax = parseOptionalPrice(url.searchParams.get("priceMax"), "priceMax");

  return {
    search: normalizeOptionalString(url.searchParams.get("search")) ?? undefined,
    genre: normalizeOptionalString(url.searchParams.get("genre")) ?? undefined,
    mood: normalizeOptionalString(url.searchParams.get("mood")) ?? undefined,
    bpm: bpm ?? undefined,
    bpmMin: bpmMin ?? undefined,
    bpmMax: bpmMax ?? undefined,
    key: normalizeOptionalString(url.searchParams.get("key")) ?? undefined,
    priceMin,
    priceMax,
    tags: parseTagListParam(url.searchParams.get("tags")),
    producer: normalizeOptionalString(url.searchParams.get("producer")) ?? undefined,
    sellerSlug: normalizeOptionalString(url.searchParams.get("sellerSlug")) ?? undefined,
    licenseType: parseLicenseType(url.searchParams.get("licenseType")),
    sort: parseSort(url.searchParams.get("sort")),
    limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 24,
  };
}
