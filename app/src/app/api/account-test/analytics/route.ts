import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  EVENT_WEIGHTS,
  FEED_MIX,
  ORGANIC_SCORE,
  RECOMMENDATION_SCORE_VERSION,
} from "@/server/analytics/analytics.constants";
import { recomputeRecommendationScores } from "@/server/analytics/analytics.service";
import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";

export const dynamic = "force-dynamic";

function analyticsTestEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.ANALYTICS_TEST_ENABLED === "true";
}

function decimalToNumber(value: { toString(): string } | number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  return typeof value === "number" ? value : Number(value.toString());
}

function ratio(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 1000) / 10;
}

function millisecondsSince(value: Date | null) {
  if (!value) {
    return null;
  }

  return Date.now() - value.getTime();
}

function topJsonEntries(value: unknown, limit = 4) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value as Record<string, unknown>)
    .map(([label, raw]) => ({
      label,
      score: Number(raw) || 0,
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function assertAccountTestAccess() {
  if (!analyticsTestEnabled()) {
    return NextResponse.json(
      { error: "analytics_test_disabled" },
      { status: 404, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  return { userId };
}

async function buildAnalyticsSnapshot() {
  const prisma = getPrisma();
  const now = new Date();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startedAt = performance.now();

  const [
    usersCount,
    sellersCount,
    publishedBeatCount,
    analyticsEventCount,
    analyticsEvent24hCount,
    analyticsEvent7dCount,
    statsCount,
    recommendationCount,
    tasteProfileCount,
    sellerStatsCount,
    eventBreakdown,
    sourceBreakdown,
    latestRecommendation,
    topRecommendations,
    topStats,
    tasteProfiles,
    latestEvents,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: {
        roles: {
          some: {
            role: "SELLER",
          },
        },
      },
    }),
    prisma.beat.count({
      where: {
        status: "PUBLISHED",
        visibility: "PUBLIC",
        moderationStatus: "CLEAN",
      },
    }),
    prisma.analyticsEvent.count(),
    prisma.analyticsEvent.count({
      where: {
        occurredAt: { gte: since24h },
      },
    }),
    prisma.analyticsEvent.count({
      where: {
        occurredAt: { gte: since7d },
      },
    }),
    prisma.beatStats.count(),
    prisma.beatRecommendationScore.count(),
    prisma.userTasteProfile.count(),
    prisma.sellerStats.count(),
    prisma.analyticsEvent.groupBy({
      by: ["type"],
      _count: { _all: true },
      orderBy: { _count: { type: "desc" } },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["source"],
      _count: { _all: true },
      orderBy: { _count: { source: "desc" } },
    }),
    prisma.beatRecommendationScore.findFirst({
      orderBy: { computedAt: "desc" },
      select: { computedAt: true, scoreVersion: true },
    }),
    prisma.beatRecommendationScore.findMany({
      orderBy: [{ organicScore: "desc" }, { computedAt: "desc" }],
      take: 8,
      include: {
        beat: {
          select: {
            id: true,
            slug: true,
            title: true,
            primaryGenre: true,
            primaryMood: true,
            bpm: true,
            owner: {
              select: {
                profile: {
                  select: {
                    displayName: true,
                    slug: true,
                  },
                },
              },
            },
            stats: true,
          },
        },
      },
    }),
    prisma.beatStats.findMany({
      orderBy: [{ purchases: "desc" }, { addToCart: "desc" }, { plays: "desc" }],
      take: 6,
      include: {
        beat: {
          select: {
            id: true,
            slug: true,
            title: true,
            primaryGenre: true,
            owner: {
              select: {
                profile: {
                  select: {
                    displayName: true,
                    slug: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.userTasteProfile.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            profile: {
              select: {
                displayName: true,
                slug: true,
              },
            },
            _count: {
              select: {
                analyticsEvents: true,
              },
            },
          },
        },
      },
    }),
    prisma.analyticsEvent.findMany({
      orderBy: { occurredAt: "desc" },
      take: 12,
      select: {
        id: true,
        type: true,
        source: true,
        occurredAt: true,
        beat: {
          select: {
            title: true,
            slug: true,
          },
        },
        user: {
          select: {
            profile: {
              select: {
                displayName: true,
                slug: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const scoreAgeMs = millisecondsSince(latestRecommendation?.computedAt ?? null);
  const statsCoverage = ratio(statsCount, publishedBeatCount);
  const scoreCoverage = ratio(recommendationCount, publishedBeatCount);
  const scoreFreshness =
    scoreAgeMs === null ? 0 : Math.max(0, 100 - Math.floor(scoreAgeMs / (60 * 60 * 1000)) * 5);
  const healthScore = Math.min(
    100,
    Math.round(statsCoverage * 0.3 + scoreCoverage * 0.45 + Math.min(100, analyticsEvent7dCount) * 0.15 + scoreFreshness * 0.1),
  );

  return {
    generatedAt: now.toISOString(),
    queryDurationMs: Math.round(performance.now() - startedAt),
    scoreVersion: latestRecommendation?.scoreVersion ?? RECOMMENDATION_SCORE_VERSION,
    health: {
      score: healthScore,
      status:
        healthScore >= 80
          ? "ready"
          : healthScore >= 45
            ? "warming_up"
            : "needs_data",
      statsCoverage,
      scoreCoverage,
      latestScoreComputedAt: latestRecommendation?.computedAt.toISOString() ?? null,
      latestScoreAgeMs: scoreAgeMs,
    },
    counts: {
      users: usersCount,
      sellers: sellersCount,
      publishedBeats: publishedBeatCount,
      analyticsEvents: analyticsEventCount,
      analyticsEvents24h: analyticsEvent24hCount,
      analyticsEvents7d: analyticsEvent7dCount,
      beatStats: statsCount,
      recommendationScores: recommendationCount,
      tasteProfiles: tasteProfileCount,
      sellerStats: sellerStatsCount,
    },
    algorithm: {
      eventWeights: EVENT_WEIGHTS,
      organicWeights: ORGANIC_SCORE,
      feedMix: FEED_MIX,
    },
    eventBreakdown: eventBreakdown.map((item) => ({
      type: item.type,
      count: item._count._all,
    })),
    sourceBreakdown: sourceBreakdown.map((item) => ({
      source: item.source ?? "unknown",
      count: item._count._all,
    })),
    topRecommendations: topRecommendations.map((item) => ({
      beatId: item.beatId,
      title: item.beat.title,
      slug: item.beat.slug,
      seller: item.beat.owner.profile?.displayName ?? item.beat.owner.profile?.slug ?? "Vendeur",
      genre: item.beat.primaryGenre,
      mood: item.beat.primaryMood,
      bpm: item.beat.bpm,
      reason: item.reason,
      organicScore: decimalToNumber(item.organicScore),
      computedAt: item.computedAt.toISOString(),
      scores: {
        engagement: decimalToNumber(item.engagementScore),
        keyword: decimalToNumber(item.keywordScore),
        similarity: decimalToNumber(item.similarityScore),
        sales: decimalToNumber(item.salesScore),
        freshness: decimalToNumber(item.freshnessScore),
        seller: decimalToNumber(item.sellerScore),
        diversity: decimalToNumber(item.diversityScore),
      },
      stats: item.beat.stats
        ? {
            impressions: item.beat.stats.impressions,
            plays: item.beat.stats.plays,
            fullPlays: item.beat.stats.fullPlays,
            skips: item.beat.stats.skips,
            likes: item.beat.stats.likes,
            licenseClicks: item.beat.stats.licenseClicks,
            addToCart: item.beat.stats.addToCart,
            purchases: item.beat.stats.purchases,
            conversionRate: decimalToNumber(item.beat.stats.conversionRate),
          }
        : null,
    })),
    topStats: topStats.map((item) => ({
      beatId: item.beatId,
      title: item.beat.title,
      slug: item.beat.slug,
      seller: item.beat.owner.profile?.displayName ?? item.beat.owner.profile?.slug ?? "Vendeur",
      genre: item.beat.primaryGenre,
      impressions: item.impressions,
      plays: item.plays,
      fullPlays: item.fullPlays,
      skips: item.skips,
      likes: item.likes,
      licenseClicks: item.licenseClicks,
      addToCart: item.addToCart,
      purchases: item.purchases,
      revenue: decimalToNumber(item.revenue),
      conversionRate: decimalToNumber(item.conversionRate),
      updatedAt: item.updatedAt.toISOString(),
    })),
    tasteProfiles: tasteProfiles.map((profile) => ({
      userId: profile.userId,
      displayName: profile.user.profile?.displayName ?? profile.user.email,
      slug: profile.user.profile?.slug ?? null,
      eventCount: profile.user._count.analyticsEvents,
      favoriteGenres: topJsonEntries(profile.favoriteGenres),
      favoriteMoods: topJsonEntries(profile.favoriteMoods),
      favoriteTags: topJsonEntries(profile.favoriteTags),
      preferredBpmRange:
        profile.preferredBpmMin !== null && profile.preferredBpmMax !== null
          ? [profile.preferredBpmMin, profile.preferredBpmMax]
          : null,
      updatedAt: profile.updatedAt.toISOString(),
    })),
    latestEvents: latestEvents.map((event) => ({
      id: event.id,
      type: event.type,
      source: event.source,
      beatTitle: event.beat?.title ?? null,
      beatSlug: event.beat?.slug ?? null,
      user: event.user?.profile?.displayName ?? event.user?.profile?.slug ?? null,
      occurredAt: event.occurredAt.toISOString(),
    })),
  };
}

export async function GET() {
  const access = await assertAccountTestAccess();

  if (access instanceof Response) {
    return access;
  }

  try {
    return NextResponse.json(await buildAnalyticsSnapshot(), {
      status: 200,
      headers: PRIVATE_JSON_HEADERS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "analytics_test_error";

    return NextResponse.json(
      { error: message, message },
      { status: 500, headers: PRIVATE_JSON_HEADERS },
    );
  }
}

export async function POST() {
  const access = await assertAccountTestAccess();

  if (access instanceof Response) {
    return access;
  }

  const startedAt = performance.now();

  try {
    const recomputedScores = await recomputeRecommendationScores();
    const snapshot = await buildAnalyticsSnapshot();

    return NextResponse.json(
      {
        ok: true,
        recomputedScores,
        durationMs: Math.round(performance.now() - startedAt),
        snapshot,
      },
      {
        status: 200,
        headers: PRIVATE_JSON_HEADERS,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "analytics_recompute_error";

    return NextResponse.json(
      { error: message, message },
      { status: 500, headers: PRIVATE_JSON_HEADERS },
    );
  }
}
