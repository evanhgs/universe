import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const syncCurrentAccountFromClerkMock = vi.fn();
const beatFindFirstMock = vi.fn();
const analyticsEventCreateMock = vi.fn();
const beatStatsUpsertMock = vi.fn();
const beatStatsUpdateMock = vi.fn();
const userFindUniqueMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/server/account/account.sync", () => ({
  syncCurrentAccountFromClerk: syncCurrentAccountFromClerkMock,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    analyticsEvent: {
      create: analyticsEventCreateMock,
    },
    beat: {
      findFirst: beatFindFirstMock,
    },
    beatStats: {
      upsert: beatStatsUpsertMock,
      update: beatStatsUpdateMock,
    },
    user: {
      findUnique: userFindUniqueMock,
    },
  }),
}));

describe("analytics events API route", () => {
  beforeEach(() => {
    authMock.mockReset();
    syncCurrentAccountFromClerkMock.mockReset();
    beatFindFirstMock.mockReset();
    analyticsEventCreateMock.mockReset();
    beatStatsUpsertMock.mockReset();
    beatStatsUpdateMock.mockReset();
    userFindUniqueMock.mockReset();

    beatFindFirstMock.mockResolvedValue({ id: "beat_123", ownerId: "seller_123" });
    analyticsEventCreateMock.mockResolvedValue({ id: "event_123", type: "BEAT_PLAY" });
    beatStatsUpsertMock.mockResolvedValue({ impressions: 0, purchases: 0 });
    beatStatsUpdateMock.mockResolvedValue({});
  });

  it("accepts an anonymous play and infers sellerId from the beat", async () => {
    authMock.mockResolvedValue({ isAuthenticated: false, userId: null });
    const { POST } = await import("@/app/api/analytics/events/route");

    const response = await POST(
      new Request("https://example.com/api/analytics/events", {
        method: "POST",
        body: JSON.stringify({
          eventType: "beat_play",
          beatId: "beat_123",
          sessionId: "sess_123",
          durationMs: 1200,
          playPercentage: 0.2,
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(analyticsEventCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "BEAT_PLAY",
        beatId: "beat_123",
        sellerId: "seller_123",
        userId: null,
        sessionId: "sess_123",
        durationMs: 1200,
        playPercentage: 0.2,
      }),
    });
    expect(await response.json()).toEqual({ id: "event_123", ok: true });
  });

  it("refuses anonymous license clicks", async () => {
    authMock.mockResolvedValue({ isAuthenticated: false, userId: null });
    const { POST } = await import("@/app/api/analytics/events/route");

    const response = await POST(
      new Request("https://example.com/api/analytics/events", {
        method: "POST",
        body: JSON.stringify({
          eventType: "license_click",
          beatId: "beat_123",
          sessionId: "sess_123",
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(analyticsEventCreateMock).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: "analytics_auth_required",
    });
  });

  it("refuses client purchase events", async () => {
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "clerk_123" });
    syncCurrentAccountFromClerkMock.mockResolvedValue({ id: "user_123" });
    const { POST } = await import("@/app/api/analytics/events/route");

    const response = await POST(
      new Request("https://example.com/api/analytics/events", {
        method: "POST",
        body: JSON.stringify({
          eventType: "purchase",
          beatId: "beat_123",
          sessionId: "sess_123",
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(analyticsEventCreateMock).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: "analytics_event_forbidden",
    });
  });
});
