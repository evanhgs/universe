import "server-only";

import type { AssetType, BeatStatus, LicenseScope, Visibility } from "../../../generated/prisma/enums";

export type BeatAssetInput = {
  bucket: string;
  objectKey: string;
  originalFilename?: string | null;
  mimeType?: string | null;
  extension?: string | null;
  sizeBytes?: number | null;
  checksumSha256?: string | null;
};

export type CreateBeatInput = {
  title: string;
  description?: string | null;
  priceAmount: number;
  currency: string;
  primaryGenre?: string | null;
  primaryMood?: string | null;
  tags: string[];
  bpm?: number | null;
  musicalKey?: string | null;
  visibility: Visibility;
  publish: boolean;
  isFree: boolean;
  brandingRequired: boolean;
  audioAsset: BeatAssetInput;
  thumbnailAsset?: BeatAssetInput | null;
  licenseOfferings: BeatLicenseOfferingInput[];
};

export type UpdateBeatInput = Partial<
  Pick<
    CreateBeatInput,
    | "title"
    | "description"
    | "priceAmount"
    | "currency"
    | "primaryGenre"
    | "primaryMood"
    | "tags"
    | "bpm"
    | "musicalKey"
    | "visibility"
    | "isFree"
    | "brandingRequired"
  >
> & {
  status?: BeatStatus;
  audioAsset?: BeatAssetInput;
  thumbnailAsset?: BeatAssetInput | null;
};

export type BeatAssetPayload = {
  id: string;
  role: AssetType;
  url: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type BeatLicenseOfferingInput = {
  scope: LicenseScope;
  title?: string | null;
  description?: string | null;
  priceAmount: number;
  currency: string;
  isDefault: boolean;
  deliveryNotes?: string | null;
  assets: BeatAssetInput[];
};

export type BeatApiPayload = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  bpm: number | null;
  musicalKey: string | null;
  durationSec: number | null;
  priceAmount: number | null;
  currency: string;
  primaryGenre: string | null;
  primaryMood: string | null;
  tags: string[];
  status: BeatStatus;
  visibility: Visibility;
  isFree: boolean;
  brandingRequired: boolean;
  firstPublishedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  seller: {
    id: string;
    slug: string | null;
    displayName: string | null;
  };
  assets: BeatAssetPayload[];
};

export type BeatListQuery = {
  search?: string;
  genre?: string;
  mood?: string;
  bpm?: number;
  bpmMin?: number;
  bpmMax?: number;
  key?: string;
  priceMin?: number;
  priceMax?: number;
  tags?: string[];
  producer?: string;
  sellerSlug?: string;
  licenseType?: LicenseScope;
  sort: "newest" | "price_asc" | "price_desc" | "bpm_asc" | "bpm_desc";
  limit: number;
};

export type BeatFeedCursor = {
  publishedAt: string;
  id: string;
};

export type BeatFeedQuery = {
  limit: number;
  cursor?: BeatFeedCursor;
};

export type BeatFeedPagePayload = {
  items: BeatApiPayload[];
  nextCursor: string | null;
  hasMore: boolean;
};
