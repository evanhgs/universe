import "server-only";

import { getPrisma } from "@/lib/prisma";
import { serializeBeat } from "@/server/beats/beat.service";

import { Prisma } from "../../../generated/prisma/client";
import type { AnalyticsEventType } from "../../../generated/prisma/enums";
import {
  ANALYTICS_EVENT_TYPES,
  ANALYTICS_SOURCES,
  ANONYMOUS_ANALYTICS_EVENTS,
  CLIENT_BLOCKED_ANALYTICS_EVENTS,
  DEFAULT_FEED_SCORE_SEED,
  FEED_DIVERSITY_LIMITS,
  FEED_MIX,
  EVENT_WEIGHTS,
  ORGANIC_SCORE,
  RECENT_IMPRESSION_WINDOW_HOURS,
  RECENT_SKIP_WINDOW_DAYS,
  RECOMMENDATION_SCORE_VERSION,
} from "./analytics.constants";
import type {
  AnalyticsEventInput,
  AnalyticsEventName,
  AnalyticsSource,
  AnalyticsViewer,
  BeatScoringInput,
  BeatStatsInput,
  FeedCursorPayload,
  ScoredBeat,
  SellerScoringInput,
  TasteMap,
  UserTasteProfileInput,
} from "./analytics.types";

const analyticsEventMap: Record<AnalyticsEventName, AnalyticsEventType> = {
  beat_impression: "BEAT_IMPRESSION",
  beat_click: "BEAT_CLICK",
  beat_play: "BEAT_PLAY",
  beat_pause: "BEAT_PAUSE",
  beat_skip: "BEAT_SKIP",
  beat_full_play: "BEAT_FULL_PLAY",
  beat_like: "BEAT_LIKE",
  beat_save: "BEAT_SAVE",
  beat_share: "BEAT_SHARE",
  seller_profile_view: "SELLER_PROFILE_VIEW",
  seller_follow: "SELLER_FOLLOW",
  license_click: "LICENSE_CLICK",
  add_to_cart: "ADD_TO_CART",
  purchase: "PURCHASE",
  search: "SEARCH",
  message_seller: "MESSAGE_SELLER",
};

const statsFieldByEvent: Partial<Record<AnalyticsEventName, keyof BeatStatsInput>> = {
  beat_impression: "impressions",
  beat_click: "clicks",
  beat_play: "plays",
  beat_pause: "pauses",
  beat_skip: "skips",
  beat_full_play: "fullPlays",
  beat_like: "likes",
  beat_save: "saves",
  beat_share: "shares",
  license_click: "licenseClicks",
  add_to_cart: "addToCart",
  purchase: "purchases",
};

const positiveTasteEvents = new Set<AnalyticsEventType>([
  "BEAT_PLAY",
  "BEAT_FULL_PLAY",
  "BEAT_LIKE",
  "BEAT_SAVE",
  "BEAT_SHARE",
  "LICENSE_CLICK",
  "ADD_TO_CART",
  "PURCHASE",
]);

const recentSeenEvents: AnalyticsEventType[] = [
  "BEAT_IMPRESSION",
  "BEAT_PLAY",
  "BEAT_FULL_PLAY",
  "BEAT_CLICK",
];

type RecommendedFeedQuery = {
  limit: number;
  cursor?: FeedCursorPayload;
  sessionId?: string;
  viewerUserId?: string | null;
};

type BeatCandidate = Parameters<typeof serializeBeat>[0] & {
  stats: {
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
    revenue: Prisma.Decimal;
    conversionRate: Prisma.Decimal;
  } | null;
  owner: Parameters<typeof serializeBeat>[0]["owner"] & {
    profile: Parameters<typeof serializeBeat>[0]["owner"]["profile"] & {
      beatCount?: number;
      sellerRatingAvg?: Prisma.Decimal | null;
      saleCount?: number;
    } | null;
    sellerStats: {
      salesCount: number;
      averageRating: Prisma.Decimal;
      responseRate: Prisma.Decimal;
      successfulOrders: number;
      disputeRate: Prisma.Decimal;
    } | null;
  };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown, maxLength = 160) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error("invalid_analytics_payload");
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized.slice(0, maxLength) : undefined;
}

function parseOptionalInteger(value: unknown, field: string, min = 0, max = 24 * 60 * 60 * 1000) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${field}_invalid`);
  }

  return parsed;
}

function parseOptionalRatio(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${field}_invalid`);
  }

  return Math.round(parsed * 10_000) / 10_000;
}

function parseMetadata(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isObject(value)) {
    throw new Error("metadata_invalid");
  }

  return value;
}

export function parseAnalyticsEventInput(payload: unknown): AnalyticsEventInput {
  if (!isObject(payload)) {
    throw new Error("invalid_analytics_payload");
  }

  const eventType = normalizeOptionalString(payload.eventType) as AnalyticsEventName | undefined;

  if (!eventType || !ANALYTICS_EVENT_TYPES.includes(eventType)) {
    throw new Error("event_type_invalid");
  }

  const source = normalizeOptionalString(payload.source) as AnalyticsSource | undefined;

  if (source !== undefined && !ANALYTICS_SOURCES.includes(source)) {
    throw new Error("source_invalid");
  }

  const beatId = normalizeOptionalString(payload.beatId);
  const keyword = normalizeOptionalString(payload.keyword, 120);

  if (eventType !== "search" && !beatId) {
    throw new Error("beat_id_required");
  }

  if (eventType === "search" && !keyword) {
    throw new Error("keyword_required");
  }

  return {
    eventType,
    beatId,
    sessionId: normalizeOptionalString(payload.sessionId, 120),
    source: source ?? "feed",
    durationMs: parseOptionalInteger(payload.durationMs, "durationMs"),
    watchMs: parseOptionalInteger(payload.watchMs, "watchMs"),
    playPercentage: parseOptionalRatio(payload.playPercentage, "playPercentage"),
    keyword,
    metadata: parseMetadata(payload.metadata),
  };
}

function analyticsErrorStatus(error: unknown) {
  const message = error instanceof Error ? error.message : "analytics_error";

  if (message === "analytics_auth_required" || message === "analytics_event_forbidden") {
    return 403;
  }

  if (message === "beat_not_found" || message === "account_not_found") {
    return 404;
  }

  return 400;
}

export function analyticsErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "analytics_error";

  return {
    status: analyticsErrorStatus(error),
    body: { error: message, message },
  };
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  return typeof value === "number" ? value : Number(value.toString());
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 1);
}

export function normalizeScore(value: number, min: number, max: number) {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return value > 0 ? 1 : 0;
  }

  return clamp01((value - min) / (max - min));
}

function daysBetween(from: Date, to: Date) {
  return Math.max(0, (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

export function computeEngagementRawScore(stats: BeatStatsInput) {
  return Math.max(
    0,
    stats.clicks * EVENT_WEIGHTS.beat_click +
      stats.plays * EVENT_WEIGHTS.beat_play +
      stats.fullPlays * EVENT_WEIGHTS.beat_full_play +
      stats.likes * EVENT_WEIGHTS.beat_like +
      stats.saves * EVENT_WEIGHTS.beat_save +
      stats.shares * EVENT_WEIGHTS.beat_share +
      stats.licenseClicks * EVENT_WEIGHTS.license_click +
      stats.addToCart * EVENT_WEIGHTS.add_to_cart +
      stats.purchases * EVENT_WEIGHTS.purchase +
      stats.skips * EVENT_WEIGHTS.beat_skip,
  );
}

export function computeFreshnessScore(createdAt: Date, now = new Date()) {
  const ageInDays = daysBetween(createdAt, now);

  if (ageInDays <= 1) return 1;
  if (ageInDays <= 7) return 0.8;
  if (ageInDays <= 30) return 0.5;
  if (ageInDays <= 90) return 0.2;

  return 0.05;
}

export function computeSalesRawScore(stats: BeatStatsInput) {
  return (
    stats.purchases * 20 +
    stats.addToCart * 10 +
    stats.licenseClicks * 5 +
    stats.revenue * 0.02 +
    stats.conversionRate * 8
  );
}

export function computeConversionRate(purchases: number, impressions: number) {
  if (impressions < 100) {
    return 0;
  }

  return purchases / impressions;
}

function normalizeMap(value: unknown): TasteMap {
  if (!isObject(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, raw]) => [key.toLowerCase(), clamp01(Number(raw))] as const)
      .filter(([, score]) => score > 0),
  );
}

function normalizedMetadataValues(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.toLowerCase()),
    ),
  );
}

function intersectionRatio(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const rightValues = new Set(right.map((value) => value.toLowerCase()));
  const common = normalizedMetadataValues(left).filter((value) => rightValues.has(value));

  return common.length / Math.max(left.length, right.length);
}

export function computeKeywordScore(userProfile: UserTasteProfileInput | null, beat: BeatScoringInput) {
  if (!userProfile) {
    return 0;
  }

  let score = 0;
  let maxScore = 1;

  for (const tag of normalizedMetadataValues([...beat.tags, ...beat.usageTags])) {
    score += userProfile.favoriteTags[tag.toLowerCase()] ?? 0;
    maxScore += 1;
  }

  for (const genre of normalizedMetadataValues([beat.genre, ...beat.genres, ...beat.secondGenres])) {
    score += userProfile.favoriteGenres[genre] ?? 0;
    maxScore += 1;
  }

  for (const mood of normalizedMetadataValues([beat.mood, ...beat.moods])) {
    score += userProfile.favoriteMoods[mood] ?? 0;
    maxScore += 1;
  }

  if (beat.bpm && userProfile.preferredBpmRange) {
    const [min, max] = userProfile.preferredBpmRange;
    score += beat.bpm >= min && beat.bpm <= max ? 1 : 0;
    maxScore += 1;
  }

  return clamp01(score / maxScore);
}

export function computeSimilarityScore(userLikedBeats: BeatScoringInput[], candidateBeat: BeatScoringInput) {
  if (userLikedBeats.length === 0) {
    return 0;
  }

  const bestScore = userLikedBeats.reduce((best, likedBeat) => {
    let score = 0;

    const genreSimilarity = intersectionRatio(
      normalizedMetadataValues([likedBeat.genre, ...likedBeat.genres, ...likedBeat.secondGenres]),
      normalizedMetadataValues([candidateBeat.genre, ...candidateBeat.genres, ...candidateBeat.secondGenres]),
    );
    const moodSimilarity = intersectionRatio(
      normalizedMetadataValues([likedBeat.mood, ...likedBeat.moods]),
      normalizedMetadataValues([candidateBeat.mood, ...candidateBeat.moods]),
    );
    const tagSimilarity = intersectionRatio(
      normalizedMetadataValues([...likedBeat.tags, ...likedBeat.usageTags]),
      normalizedMetadataValues([...candidateBeat.tags, ...candidateBeat.usageTags]),
    );

    score += genreSimilarity * 0.3;
    score += moodSimilarity * 0.15;
    if (likedBeat.bpm && candidateBeat.bpm && Math.abs(likedBeat.bpm - candidateBeat.bpm) <= 10) {
      score += 0.2;
    }
    if (likedBeat.musicalKey && likedBeat.musicalKey === candidateBeat.musicalKey) score += 0.1;
    score += tagSimilarity * 0.25;

    return Math.max(best, score);
  }, 0);

  return clamp01(bestScore);
}

export function computeSellerRawScore(seller: SellerScoringInput) {
  return Math.max(
    0,
    seller.salesCount * 2 +
      seller.averageRating * 10 +
      seller.responseRate * 5 +
      seller.successfulOrders * 3 -
      seller.disputeRate * 10,
  );
}

export function computeOrganicScore(scores: {
  engagement: number;
  keyword: number;
  similarity: number;
  sales: number;
  freshness: number;
  seller: number;
  diversity: number;
}) {
  return clamp01(
    scores.engagement * ORGANIC_SCORE.engagement_score +
      scores.keyword * ORGANIC_SCORE.keyword_score +
      scores.similarity * ORGANIC_SCORE.similarity_score +
      scores.sales * ORGANIC_SCORE.sales_score +
      scores.freshness * ORGANIC_SCORE.freshness_score +
      scores.seller * ORGANIC_SCORE.seller_score +
      scores.diversity * ORGANIC_SCORE.diversity_score,
  );
}

function emptyStats(): BeatStatsInput {
  return {
    impressions: 0,
    clicks: 0,
    plays: 0,
    pauses: 0,
    skips: 0,
    fullPlays: 0,
    likes: 0,
    saves: 0,
    shares: 0,
    licenseClicks: 0,
    addToCart: 0,
    purchases: 0,
    revenue: 0,
    conversionRate: 0,
  };
}

function toBeatStatsInput(stats: BeatCandidate["stats"]): BeatStatsInput {
  if (!stats) {
    return emptyStats();
  }

  return {
    impressions: stats.impressions,
    clicks: stats.clicks,
    plays: stats.plays,
    pauses: stats.pauses,
    skips: stats.skips,
    fullPlays: stats.fullPlays,
    likes: stats.likes,
    saves: stats.saves,
    shares: stats.shares,
    licenseClicks: stats.licenseClicks,
    addToCart: stats.addToCart,
    purchases: stats.purchases,
    revenue: decimalToNumber(stats.revenue),
    conversionRate: decimalToNumber(stats.conversionRate),
  };
}

function toSellerScoringInput(candidate: BeatCandidate): SellerScoringInput {
  const sellerStats = candidate.owner.sellerStats;

  return {
    salesCount: sellerStats?.salesCount ?? candidate.owner.profile?.saleCount ?? 0,
    averageRating: decimalToNumber(sellerStats?.averageRating ?? candidate.owner.profile?.sellerRatingAvg),
    responseRate: decimalToNumber(sellerStats?.responseRate),
    successfulOrders: sellerStats?.successfulOrders ?? candidate.owner.profile?.saleCount ?? 0,
    disputeRate: decimalToNumber(sellerStats?.disputeRate),
  };
}

function toBeatScoringInput(candidate: BeatCandidate): BeatScoringInput {
  return {
    id: candidate.id,
    sellerId: candidate.ownerId,
    title: candidate.title,
    description: candidate.description,
    tags: candidate.tags,
    usageTags: candidate.usageTags,
    genre: candidate.mainGenres[0] ?? null,
    genres: candidate.mainGenres,
    secondGenres: candidate.secondGenres,
    mood: candidate.moods[0] ?? null,
    moods: candidate.moods,
    bpm: candidate.bpm,
    musicalKey: candidate.musicalKey,
    priceAmount: decimalToNumber(candidate.basePriceAmount),
    createdAt: candidate.createdAt,
    publishedAt: candidate.publishedAt,
    seller: toSellerScoringInput(candidate),
    stats: toBeatStatsInput(candidate.stats),
  };
}

function encodeFeedCursor(cursor: FeedCursorPayload) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function parseRecommendedFeedQuery(url: URL): {
  limit: number;
  cursor?: FeedCursorPayload;
  sessionId?: string;
} {
  const limitRaw = Number(url.searchParams.get("limit") ?? 10);
  const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 20) : 10;
  const sessionId = normalizeOptionalString(url.searchParams.get("sessionId"), 120);
  const cursorRaw = url.searchParams.get("cursor");

  if (!cursorRaw) {
    return { limit, sessionId };
  }

  try {
    const decoded = JSON.parse(Buffer.from(cursorRaw, "base64url").toString("utf8")) as unknown;

    if (!isObject(decoded)) {
      throw new Error("feed_cursor_invalid");
    }

    const seed = Number(decoded.seed);
    const offset = Number(decoded.offset);

    if (!Number.isFinite(seed) || !Number.isInteger(offset) || offset < 0) {
      throw new Error("feed_cursor_invalid");
    }

    return { limit, sessionId, cursor: { seed, offset } };
  } catch {
    throw new Error("feed_cursor_invalid");
  }
}

async function findUserIdByClerkId(clerkUserId: string) {
  const account = await getPrisma().user.findUnique({
    where: { clerkUserId },
    select: { id: true },
  });

  if (!account) {
    throw new Error("account_not_found");
  }

  return account.id;
}

function assertTrackingAllowed(input: AnalyticsEventInput, viewer: AnalyticsViewer) {
  if (CLIENT_BLOCKED_ANALYTICS_EVENTS.has(input.eventType) && viewer.kind !== "server") {
    throw new Error("analytics_event_forbidden");
  }

  if (viewer.kind === "anonymous" && !ANONYMOUS_ANALYTICS_EVENTS.has(input.eventType)) {
    throw new Error("analytics_auth_required");
  }
}

async function incrementBeatStats(beatId: string, input: AnalyticsEventInput) {
  const field = statsFieldByEvent[input.eventType];

  if (!field) {
    return;
  }

  const revenue =
    input.eventType === "purchase" && typeof input.metadata?.revenue === "number"
      ? Math.max(0, input.metadata.revenue)
      : 0;

  const current = await getPrisma().beatStats.upsert({
    where: { beatId },
    create: {
      beatId,
      [field]: 1,
      revenue,
    },
    update: {
      [field]: { increment: 1 },
      ...(revenue > 0 ? { revenue: { increment: revenue } } : {}),
    },
    select: {
      impressions: true,
      purchases: true,
    },
  });

  await getPrisma().beatStats.update({
    where: { beatId },
    data: {
      conversionRate: computeConversionRate(current.purchases, current.impressions),
    },
  });
}

export async function recordAnalyticsEvent(input: AnalyticsEventInput, viewer: AnalyticsViewer) {
  assertTrackingAllowed(input, viewer);

  const userId =
    viewer.kind === "user"
      ? await findUserIdByClerkId(viewer.clerkUserId)
      : viewer.kind === "server"
        ? viewer.userId ?? null
        : null;
  const beat = input.beatId
    ? await getPrisma().beat.findFirst({
        where: {
          id: input.beatId,
          status: "PUBLISHED",
          visibility: "PUBLIC",
          moderationStatus: "CLEAN",
        },
        select: { id: true, ownerId: true },
      })
    : null;

  if (input.beatId && !beat) {
    throw new Error("beat_not_found");
  }

  const event = await getPrisma().analyticsEvent.create({
    data: {
      type: analyticsEventMap[input.eventType],
      beatId: beat?.id,
      sellerId: beat?.ownerId,
      userId,
      sessionId: input.sessionId,
      source: input.source ?? "feed",
      durationMs: input.durationMs,
      watchMs: input.watchMs ?? input.durationMs,
      playPercentage: input.playPercentage,
      keyword: input.keyword,
      metadataJson: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });

  if (beat) {
    await incrementBeatStats(beat.id, input);
  }

  if (userId && positiveTasteEvents.has(event.type)) {
    await recomputeUserTasteProfile(userId);
  }

  return event;
}

export async function aggregateBeatStats() {
  const events = await getPrisma().analyticsEvent.findMany({
    where: {
      beatId: { not: null },
    },
    select: {
      beatId: true,
      type: true,
      metadataJson: true,
    },
  });
  const statsByBeat = new Map<string, BeatStatsInput>();

  for (const event of events) {
    if (!event.beatId) {
      continue;
    }

    const stats = statsByBeat.get(event.beatId) ?? emptyStats();

    switch (event.type) {
      case "BEAT_IMPRESSION":
        stats.impressions += 1;
        break;
      case "BEAT_CLICK":
        stats.clicks += 1;
        break;
      case "BEAT_PLAY":
        stats.plays += 1;
        break;
      case "BEAT_PAUSE":
        stats.pauses += 1;
        break;
      case "BEAT_SKIP":
        stats.skips += 1;
        break;
      case "BEAT_FULL_PLAY":
        stats.fullPlays += 1;
        break;
      case "BEAT_LIKE":
        stats.likes += 1;
        break;
      case "BEAT_SAVE":
        stats.saves += 1;
        break;
      case "BEAT_SHARE":
        stats.shares += 1;
        break;
      case "LICENSE_CLICK":
        stats.licenseClicks += 1;
        break;
      case "ADD_TO_CART":
        stats.addToCart += 1;
        break;
      case "PURCHASE":
        stats.purchases += 1;
        if (isObject(event.metadataJson) && typeof event.metadataJson.revenue === "number") {
          stats.revenue += Math.max(0, event.metadataJson.revenue);
        }
        break;
    }

    statsByBeat.set(event.beatId, stats);
  }

  await Promise.all(
    [...statsByBeat.entries()].map(([beatId, stats]) =>
      getPrisma().beatStats.upsert({
        where: { beatId },
        create: {
          beatId,
          ...stats,
          conversionRate: computeConversionRate(stats.purchases, stats.impressions),
        },
        update: {
          ...stats,
          conversionRate: computeConversionRate(stats.purchases, stats.impressions),
        },
      }),
    ),
  );

  return statsByBeat.size;
}

function addWeightedCount(target: Map<string, number>, key: string | null, weight: number) {
  if (!key) {
    return;
  }

  target.set(key.toLowerCase(), (target.get(key.toLowerCase()) ?? 0) + weight);
}

function normalizeTasteCountMap(counts: Map<string, number>) {
  const max = Math.max(...counts.values(), 0);

  if (max <= 0) {
    return {};
  }

  return Object.fromEntries(
    [...counts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 50)
      .map(([key, value]) => [key, Math.round((value / max) * 100) / 100]),
  );
}

export async function recomputeUserTasteProfile(userId: string) {
  const events = await getPrisma().analyticsEvent.findMany({
    where: {
      userId,
      type: { in: [...positiveTasteEvents] },
      beatId: { not: null },
    },
    orderBy: { occurredAt: "desc" },
    take: 200,
    include: {
      beat: {
        select: {
          mainGenres: true,
          secondGenres: true,
          moods: true,
          tags: true,
          usageTags: true,
          bpm: true,
        },
      },
    },
  });
  const genres = new Map<string, number>();
  const moods = new Map<string, number>();
  const tags = new Map<string, number>();
  const bpms: number[] = [];

  for (const event of events) {
    if (!event.beat) {
      continue;
    }

    const eventName = Object.entries(analyticsEventMap).find(([, type]) => type === event.type)?.[0] as
      | AnalyticsEventName
      | undefined;
    const weight = eventName ? Math.max(EVENT_WEIGHTS[eventName], 0.5) : 1;

    for (const genre of [...event.beat.mainGenres, ...event.beat.secondGenres]) {
      addWeightedCount(genres, genre, weight);
    }

    for (const mood of event.beat.moods) {
      addWeightedCount(moods, mood, weight);
    }

    for (const tag of [...event.beat.tags, ...event.beat.usageTags]) {
      addWeightedCount(tags, tag, weight);
    }

    if (event.beat.bpm) {
      bpms.push(event.beat.bpm);
    }
  }

  const preferredBpmMin = bpms.length > 0 ? Math.max(20, Math.min(...bpms) - 5) : null;
  const preferredBpmMax = bpms.length > 0 ? Math.min(300, Math.max(...bpms) + 5) : null;

  return getPrisma().userTasteProfile.upsert({
    where: { userId },
    create: {
      userId,
      favoriteGenres: normalizeTasteCountMap(genres),
      favoriteMoods: normalizeTasteCountMap(moods),
      favoriteTags: normalizeTasteCountMap(tags),
      preferredBpmMin,
      preferredBpmMax,
    },
    update: {
      favoriteGenres: normalizeTasteCountMap(genres),
      favoriteMoods: normalizeTasteCountMap(moods),
      favoriteTags: normalizeTasteCountMap(tags),
      preferredBpmMin,
      preferredBpmMax,
    },
  });
}

function toTasteProfileInput(profile: {
  favoriteGenres: unknown;
  favoriteMoods: unknown;
  favoriteTags: unknown;
  preferredBpmMin: number | null;
  preferredBpmMax: number | null;
} | null): UserTasteProfileInput | null {
  if (!profile) {
    return null;
  }

  return {
    favoriteGenres: normalizeMap(profile.favoriteGenres),
    favoriteMoods: normalizeMap(profile.favoriteMoods),
    favoriteTags: normalizeMap(profile.favoriteTags),
    preferredBpmRange:
      profile.preferredBpmMin !== null && profile.preferredBpmMax !== null
        ? [profile.preferredBpmMin, profile.preferredBpmMax]
        : null,
  };
}

function stableNoise(id: string, seed: number) {
  let hash = Math.floor(seed * 10_000);

  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }

  return (hash % 10_000) / 10_000;
}

export function applyDiversityRules<T extends { beat: { sellerId: string; genre: string | null; mood: string | null } }>(
  beats: T[],
  limit: number,
) {
  const result: T[] = [];
  const sellerCount = new Map<string, number>();
  const genreCount = new Map<string, number>();
  const moodCount = new Map<string, number>();

  for (const beat of beats) {
    const sellerKey = beat.beat.sellerId;
    const genreKey = beat.beat.genre ?? "unknown";
    const moodKey = beat.beat.mood ?? "unknown";

    if ((sellerCount.get(sellerKey) ?? 0) >= FEED_DIVERSITY_LIMITS.seller) continue;
    if ((genreCount.get(genreKey) ?? 0) >= FEED_DIVERSITY_LIMITS.genre) continue;
    if ((moodCount.get(moodKey) ?? 0) >= FEED_DIVERSITY_LIMITS.mood) continue;

    result.push(beat);
    sellerCount.set(sellerKey, (sellerCount.get(sellerKey) ?? 0) + 1);
    genreCount.set(genreKey, (genreCount.get(genreKey) ?? 0) + 1);
    moodCount.set(moodKey, (moodCount.get(moodKey) ?? 0) + 1);

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function scoreCandidates(args: {
  candidates: BeatCandidate[];
  tasteProfile: UserTasteProfileInput | null;
  likedBeats: BeatScoringInput[];
  seed: number;
}) {
  const scoringInputs = args.candidates.map(toBeatScoringInput);
  const engagementRaw = scoringInputs.map((beat) => computeEngagementRawScore(beat.stats));
  const salesRaw = scoringInputs.map((beat) => computeSalesRawScore(beat.stats));
  const sellerRaw = scoringInputs.map((beat) => computeSellerRawScore(beat.seller));
  const engagementMin = Math.min(...engagementRaw, 0);
  const engagementMax = Math.max(...engagementRaw, 0);
  const salesMin = Math.min(...salesRaw, 0);
  const salesMax = Math.max(...salesRaw, 0);
  const sellerMin = Math.min(...sellerRaw, 0);
  const sellerMax = Math.max(...sellerRaw, 0);

  return scoringInputs.map((beat, index): ScoredBeat => {
    const scores = {
      engagement: normalizeScore(engagementRaw[index] ?? 0, engagementMin, engagementMax),
      keyword: computeKeywordScore(args.tasteProfile, beat),
      similarity: computeSimilarityScore(args.likedBeats, beat),
      sales: normalizeScore(salesRaw[index] ?? 0, salesMin, salesMax),
      freshness: computeFreshnessScore(beat.publishedAt ?? beat.createdAt),
      seller: normalizeScore(sellerRaw[index] ?? 0, sellerMin, sellerMax),
      diversity: 1,
    };
    const firstPublicationBoost = (args.candidates[index]?.owner.profile?.beatCount ?? 999) <= 3 ? 0.04 : 0;
    const organicScore = clamp01(computeOrganicScore(scores) + firstPublicationBoost);

    return {
      beat,
      scores,
      organicScore: clamp01(organicScore + stableNoise(beat.id, args.seed) * 0.015),
      reason: "organic",
    };
  });
}

function withReason<T extends ScoredBeat>(beats: T[], reason: T["reason"]) {
  return beats.map((beat) => ({ ...beat, reason }));
}

function selectFeedMix(scored: ScoredBeat[], limit: number, seed: number) {
  const organicLimit = Math.floor(limit * FEED_MIX.organic);
  const explorationLimit = Math.floor(limit * FEED_MIX.exploration);
  const newSellerLimit = Math.floor(limit * FEED_MIX.newSellers);
  const trendingLimit = Math.max(0, limit - organicLimit - explorationLimit - newSellerLimit);
  const selected: ScoredBeat[] = [];
  const seen = new Set<string>();

  function pushMany(beats: ScoredBeat[], quota: number) {
    for (const beat of beats) {
      if (selected.length >= limit || quota <= 0) {
        break;
      }

      if (seen.has(beat.beat.id)) {
        continue;
      }

      selected.push(beat);
      seen.add(beat.beat.id);
      quota -= 1;
    }
  }

  const byOrganic = [...scored].sort((a, b) => b.organicScore - a.organicScore);
  const exploration = withReason(
    scored
      .filter((beat) => beat.organicScore >= 0.35 && beat.beat.stats.impressions < 1000)
      .sort((a, b) => b.organicScore + stableNoise(b.beat.id, seed) - (a.organicScore + stableNoise(a.beat.id, seed))),
    "exploration",
  );
  const newSellers = withReason(
    scored
      .filter((beat) => beat.beat.seller.salesCount === 0)
      .sort((a, b) => b.organicScore - a.organicScore),
    "new_seller",
  );
  const trending = withReason(
    scored
      .filter((beat) => beat.beat.stats.impressions >= 20)
      .sort(
        (a, b) =>
          b.beat.stats.plays +
          b.beat.stats.likes * 2 +
          b.beat.stats.purchases * 6 -
          (a.beat.stats.plays + a.beat.stats.likes * 2 + a.beat.stats.purchases * 6),
      ),
    "trending",
  );

  pushMany(byOrganic, organicLimit);
  pushMany(exploration, explorationLimit);
  pushMany(newSellers, newSellerLimit);
  pushMany(trending, trendingLimit);
  pushMany(byOrganic, limit - selected.length);

  const diversified = applyDiversityRules(selected, limit);

  if (diversified.length >= limit) {
    return diversified;
  }

  pushMany(byOrganic, limit - diversified.length);

  return selected.slice(0, limit);
}

async function loadUserTasteContext(userId: string | null | undefined) {
  if (!userId) {
    return { tasteProfile: null, likedBeats: [] };
  }

  const [profile, positiveEvents] = await Promise.all([
    getPrisma().userTasteProfile.findUnique({ where: { userId } }),
    getPrisma().analyticsEvent.findMany({
      where: {
        userId,
        type: { in: [...positiveTasteEvents] },
        beatId: { not: null },
      },
      orderBy: { occurredAt: "desc" },
      take: 40,
      include: {
        beat: {
          include: {
            owner: {
              select: {
                id: true,
                profile: {
                  select: {
                    saleCount: true,
                    sellerRatingAvg: true,
                    beatCount: true,
                  },
                },
                sellerStats: true,
              },
            },
            stats: true,
          },
        },
      },
    }),
  ]);

  const likedBeats = positiveEvents
    .map((event) => event.beat)
    .filter((beat): beat is NonNullable<typeof beat> => Boolean(beat))
    .map((beat) =>
      toBeatScoringInput({
        ...beat,
        owner: {
          ...beat.owner,
          clerkUserId: null,
          profile: beat.owner.profile,
        },
        assets: [],
      } as BeatCandidate),
    );

  return {
    tasteProfile: toTasteProfileInput(profile),
    likedBeats,
  };
}

async function loadRecentExclusions(args: {
  userId?: string | null;
  sessionId?: string;
}) {
  const now = Date.now();
  const seenSince = new Date(now - RECENT_IMPRESSION_WINDOW_HOURS * 60 * 60 * 1000);
  const skippedSince = new Date(now - RECENT_SKIP_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const actorWhere =
    args.userId || args.sessionId
      ? {
          OR: [
            ...(args.userId ? [{ userId: args.userId }] : []),
            ...(args.sessionId ? [{ sessionId: args.sessionId }] : []),
          ],
        }
      : null;

  if (!actorWhere) {
    return { beatIds: new Set<string>(), purchasedBeatIds: new Set<string>() };
  }

  const [recentEvents, entitlements] = await Promise.all([
    getPrisma().analyticsEvent.findMany({
      where: {
        ...actorWhere,
        beatId: { not: null },
        OR: [
          { type: { in: recentSeenEvents }, occurredAt: { gte: seenSince } },
          { type: "BEAT_SKIP", occurredAt: { gte: skippedSince } },
        ],
      },
      select: { beatId: true },
    }),
    args.userId
      ? getPrisma().purchaseEntitlement.findMany({
          where: {
            buyerId: args.userId,
            beatId: { not: null },
            status: "ACTIVE",
          },
          select: { beatId: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    beatIds: new Set(recentEvents.map((event) => event.beatId).filter((id): id is string => Boolean(id))),
    purchasedBeatIds: new Set(entitlements.map((entitlement) => entitlement.beatId).filter((id): id is string => Boolean(id))),
  };
}

async function loadFeedCandidates(excludedBeatIds: Set<string>, take = 240): Promise<BeatCandidate[]> {
  return getPrisma().beat.findMany({
    where: {
      status: "PUBLISHED",
      visibility: "PUBLIC",
      moderationStatus: "CLEAN",
      publishedAt: { not: null },
      ...(excludedBeatIds.size > 0 ? { id: { notIn: [...excludedBeatIds] } } : {}),
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take,
    include: {
      owner: {
        select: {
          id: true,
          clerkUserId: true,
          profile: {
            select: {
              slug: true,
              displayName: true,
              beatCount: true,
              saleCount: true,
              sellerRatingAvg: true,
            },
          },
          sellerStats: true,
        },
      },
      assets: {
        orderBy: {
          sortOrder: "asc",
        },
        include: {
          asset: true,
        },
      },
      stats: true,
    },
  });
}

export async function listRecommendedFeedPagePayload(query: RecommendedFeedQuery) {
  const seed = query.cursor?.seed ?? (Math.random() || DEFAULT_FEED_SCORE_SEED);
  const offset = query.cursor?.offset ?? 0;
  const { beatIds, purchasedBeatIds } = await loadRecentExclusions({
    userId: query.viewerUserId,
    sessionId: query.sessionId,
  });
  const excludedBeatIds = new Set([...beatIds, ...purchasedBeatIds]);
  let candidates = await loadFeedCandidates(excludedBeatIds);

  if (candidates.length < query.limit) {
    candidates = await loadFeedCandidates(purchasedBeatIds);
  }

  const { likedBeats, tasteProfile } = await loadUserTasteContext(query.viewerUserId);
  const scored = scoreCandidates({ candidates, likedBeats, tasteProfile, seed });
  const ranked = selectFeedMix(scored, Math.max(query.limit + offset + 1, query.limit), seed);
  const pageItems = ranked.slice(offset, offset + query.limit);
  const hasMore = ranked.length > offset + query.limit;

  await persistRecommendationScores(pageItems);

  return {
    items: await Promise.all(
      pageItems.map(async (item) => ({
        ...(await serializeBeat(candidates.find((candidate) => candidate.id === item.beat.id)!)),
        recommendation: {
          score: item.organicScore,
          reason: item.reason,
        },
      })),
    ),
    nextCursor: hasMore ? encodeFeedCursor({ seed, offset: offset + query.limit }) : null,
    hasMore,
  };
}

async function persistRecommendationScores(pageItems: ScoredBeat[]) {
  await Promise.all(
    pageItems.map((item) =>
      getPrisma().beatRecommendationScore.upsert({
        where: { beatId: item.beat.id },
        create: {
          beatId: item.beat.id,
          engagementScore: item.scores.engagement,
          keywordScore: item.scores.keyword,
          similarityScore: item.scores.similarity,
          salesScore: item.scores.sales,
          freshnessScore: item.scores.freshness,
          sellerScore: item.scores.seller,
          diversityScore: item.scores.diversity,
          organicScore: item.organicScore,
          reason: item.reason,
          scoreVersion: RECOMMENDATION_SCORE_VERSION,
          inputsJson: item.scores,
        },
        update: {
          engagementScore: item.scores.engagement,
          keywordScore: item.scores.keyword,
          similarityScore: item.scores.similarity,
          salesScore: item.scores.sales,
          freshnessScore: item.scores.freshness,
          sellerScore: item.scores.seller,
          diversityScore: item.scores.diversity,
          organicScore: item.organicScore,
          reason: item.reason,
          scoreVersion: RECOMMENDATION_SCORE_VERSION,
          inputsJson: item.scores,
          computedAt: new Date(),
        },
      }),
    ),
  );
}

export async function recomputeRecommendationScores() {
  await aggregateBeatStats();
  const candidates = await loadFeedCandidates(new Set(), 500);
  const scored = scoreCandidates({
    candidates,
    likedBeats: [],
    tasteProfile: null,
    seed: DEFAULT_FEED_SCORE_SEED,
  });

  await persistRecommendationScores(scored);

  return scored.length;
}
