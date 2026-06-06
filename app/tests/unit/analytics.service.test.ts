import { describe, expect, it } from "vitest";

import {
  applyDiversityRules,
  computeEngagementRawScore,
  computeFreshnessScore,
  computeKeywordScore,
  computeOrganicScore,
  computeSalesRawScore,
  normalizeScore,
  parseAnalyticsEventInput,
} from "@/server/analytics/analytics.service";
import type { BeatScoringInput, UserTasteProfileInput } from "@/server/analytics/analytics.types";

function beat(overrides: Partial<BeatScoringInput> = {}): BeatScoringInput {
  return {
    id: "beat_1",
    sellerId: "seller_1",
    title: "Dark Piano Drill",
    description: null,
    tags: ["drill", "piano", "dark"],
    genre: "drill",
    mood: "dark",
    bpm: 142,
    musicalKey: "Am",
    priceAmount: 29,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    publishedAt: new Date("2026-06-01T00:00:00.000Z"),
    seller: {
      salesCount: 0,
      averageRating: 0,
      responseRate: 0,
      successfulOrders: 0,
      disputeRate: 0,
    },
    stats: {
      impressions: 100,
      clicks: 5,
      plays: 10,
      pauses: 2,
      skips: 1,
      fullPlays: 4,
      likes: 3,
      saves: 2,
      shares: 1,
      licenseClicks: 2,
      addToCart: 1,
      purchases: 1,
      revenue: 29,
      conversionRate: 0.01,
    },
    ...overrides,
  };
}

describe("analytics service", () => {
  it("normalizes analytics event payloads", () => {
    expect(
      parseAnalyticsEventInput({
        eventType: "beat_play",
        beatId: " beat_123 ",
        sessionId: " sess_123 ",
        source: "feed",
        durationMs: 4200,
        playPercentage: 0.5,
      }),
    ).toEqual({
      eventType: "beat_play",
      beatId: "beat_123",
      sessionId: "sess_123",
      source: "feed",
      durationMs: 4200,
      watchMs: undefined,
      playPercentage: 0.5,
      keyword: undefined,
      metadata: undefined,
    });

    expect(() => parseAnalyticsEventInput({ eventType: "purchase", beatId: "beat_123" })).not.toThrow();
    expect(() => parseAnalyticsEventInput({ eventType: "beat_play" })).toThrow("beat_id_required");
    expect(() => parseAnalyticsEventInput({ eventType: "search" })).toThrow("keyword_required");
  });

  it("computes bounded ranking scores", () => {
    const candidate = beat();
    const profile: UserTasteProfileInput = {
      favoriteGenres: { drill: 0.8 },
      favoriteMoods: { dark: 0.9 },
      favoriteTags: { piano: 0.7, drill: 0.6 },
      preferredBpmRange: [130, 150],
    };

    expect(computeEngagementRawScore(candidate.stats)).toBeGreaterThan(0);
    expect(computeSalesRawScore(candidate.stats)).toBeGreaterThan(0);
    expect(computeFreshnessScore(candidate.createdAt, new Date("2026-06-05T00:00:00.000Z"))).toBe(0.8);
    expect(computeKeywordScore(profile, candidate)).toBeGreaterThan(0);
    expect(normalizeScore(5, 0, 10)).toBe(0.5);

    const organicScore = computeOrganicScore({
      engagement: 1,
      keyword: 1,
      similarity: 1,
      sales: 1,
      freshness: 1,
      seller: 1,
      diversity: 1,
    });

    expect(organicScore).toBe(1);
  });

  it("applies seller, genre and mood diversity limits", () => {
    const scored = Array.from({ length: 8 }, (_, index) => ({
      beat: beat({
        id: `beat_${index}`,
        sellerId: index < 5 ? "seller_a" : `seller_${index}`,
        genre: "drill",
        mood: "dark",
      }),
      scores: {
        engagement: 1,
        keyword: 1,
        similarity: 1,
        sales: 1,
        freshness: 1,
        seller: 1,
        diversity: 1,
      },
      organicScore: 1 - index * 0.01,
      reason: "organic" as const,
    }));

    const result = applyDiversityRules(scored, 20);

    expect(result.filter((item) => item.beat.sellerId === "seller_a").length).toBeLessThanOrEqual(3);
    expect(result.filter((item) => item.beat.genre === "drill").length).toBeLessThanOrEqual(6);
    expect(result.filter((item) => item.beat.mood === "dark").length).toBeLessThanOrEqual(5);
  });
});
