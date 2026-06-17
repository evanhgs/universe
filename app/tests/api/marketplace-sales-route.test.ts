import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const getCurrentSellerDashboardMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/server/marketplace/marketplace.service", () => ({
  getCurrentSellerDashboard: getCurrentSellerDashboardMock,
}));

describe("marketplace sales API route", () => {
  beforeEach(() => {
    authMock.mockReset();
    getCurrentSellerDashboardMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ isAuthenticated: false });
    const { GET } = await import("@/app/api/marketplace/sales/route");

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("returns the seller dashboard payload", async () => {
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "user_123" });
    getCurrentSellerDashboardMock.mockResolvedValue({
      items: [],
      count: 0,
      summary: {
        paidSalesCount: 0,
        orderLineCount: 0,
        beatCount: 1,
        publishedBeatCount: 1,
        draftBeatCount: 0,
        processingBeatCount: 0,
        hiddenBeatCount: 0,
        revenueByCurrency: [],
        payoutEligibility: {
          canReceivePayouts: false,
          kycStatus: "NOT_STARTED",
          payoutAccountReady: false,
          reason: "PENDING_KYC",
        },
      },
      beats: [{ id: "beat_123" }],
      analyticsSummary: {
        impressions: 0,
        plays: 0,
        fullPlays: 0,
        licenseClicks: 0,
        addToCart: 0,
        purchases: 0,
        revenue: 0,
        playRate: 0,
        licenseClickRate: 0,
        conversionRate: 0,
      },
      beatPerformance: [],
      exclusiveOffers: [],
      promotions: [],
    });
    const { GET } = await import("@/app/api/marketplace/sales/route");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(getCurrentSellerDashboardMock).toHaveBeenCalledWith("user_123");
    expect(await response.json()).toMatchObject({
      count: 0,
      summary: { beatCount: 1 },
      beats: [{ id: "beat_123" }],
    });
  });

  it("maps inactive account errors to 400", async () => {
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "user_123" });
    getCurrentSellerDashboardMock.mockRejectedValue(new Error("account_not_active"));
    const { GET } = await import("@/app/api/marketplace/sales/route");

    const response = await GET();

    expect(response.status).toBe(400);
  });
});
