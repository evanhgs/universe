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
      },
      beats: [{ id: "beat_123" }],
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

  it("maps seller role errors to 403", async () => {
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "user_123" });
    getCurrentSellerDashboardMock.mockRejectedValue(new Error("seller_role_required"));
    const { GET } = await import("@/app/api/marketplace/sales/route");

    const response = await GET();

    expect(response.status).toBe(403);
  });
});
