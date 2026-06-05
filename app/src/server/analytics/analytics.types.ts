import "server-only";

import type { AnalyticsEventType } from "../../../generated/prisma/enums";
import type { ANALYTICS_EVENT_TYPES, ANALYTICS_SOURCES } from "./analytics.constants";

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_TYPES)[number];

export type AnalyticsSource = (typeof ANALYTICS_SOURCES)[number];

export type AnalyticsEventInput = {
  eventType: AnalyticsEventName;
  beatId?: string;
  sessionId?: string;
  source?: AnalyticsSource;
  durationMs?: number;
  watchMs?: number;
  playPercentage?: number;
  keyword?: string;
  metadata?: Record<string, unknown>;
};

export type AnalyticsViewer =
  | { kind: "anonymous" }
  | { kind: "user"; clerkUserId: string }
  | { kind: "server"; userId?: string | null };

export type AnalyticsEventRecord = {
  id: string;
  type: AnalyticsEventType;
  beatId: string | null;
  sellerId: string | null;
  userId: string | null;
  sessionId: string | null;
  source: string | null;
  durationMs: number | null;
  watchMs: number | null;
  playPercentage: number | null;
  keyword: string | null;
  metadataJson: unknown;
  occurredAt: Date;
  createdAt: Date;
};

export type BeatStatsInput = {
  impressions: number;
  clicks: number;
  plays: number;
  pauses: number;
  skips: number;
  fullPlays: number;
  likes: number;
  saves: number;
  shares: number;
  licenseClicks: number;
  addToCart: number;
  purchases: number;
  revenue: number;
  conversionRate: number;
};

export type BeatScoringInput = {
  id: string;
  sellerId: string;
  title: string;
  description: string | null;
  tags: string[];
  genre: string | null;
  mood: string | null;
  bpm: number | null;
  musicalKey: string | null;
  priceAmount: number | null;
  createdAt: Date;
  publishedAt: Date | null;
  seller: SellerScoringInput;
  stats: BeatStatsInput;
};

export type SellerScoringInput = {
  salesCount: number;
  averageRating: number;
  responseRate: number;
  successfulOrders: number;
  disputeRate: number;
};

export type TasteMap = Record<string, number>;

export type UserTasteProfileInput = {
  favoriteGenres: TasteMap;
  favoriteMoods: TasteMap;
  favoriteTags: TasteMap;
  preferredBpmRange: [number, number] | null;
};

export type ScoreBreakdown = {
  engagement: number;
  keyword: number;
  similarity: number;
  sales: number;
  freshness: number;
  seller: number;
  diversity: number;
};

export type ScoredBeat<TBeat = BeatScoringInput> = {
  beat: TBeat;
  scores: ScoreBreakdown;
  organicScore: number;
  reason: "organic" | "exploration" | "new_seller" | "trending";
};

export type FeedCursorPayload = {
  seed: number;
  offset: number;
};
