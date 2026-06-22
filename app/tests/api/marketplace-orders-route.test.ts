import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const createDirectPurchaseOrderForCurrentBuyerMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/server/marketplace/marketplace.service", () => ({
  createDirectPurchaseOrderForCurrentBuyer: createDirectPurchaseOrderForCurrentBuyerMock,
}));

describe("marketplace orders API route", () => {
  beforeEach(() => {
    authMock.mockReset();
    createDirectPurchaseOrderForCurrentBuyerMock.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue({ isAuthenticated: false });
    const { POST } = await import("@/app/api/marketplace/orders/route");

    const response = await POST(new Request("https://example.com/api/marketplace/orders"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 400 for invalid order payloads", async () => {
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "user_123" });
    const { POST } = await import("@/app/api/marketplace/orders/route");

    const response = await POST(
      new Request("https://example.com/api/marketplace/orders", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Provide exactly one purchase target.",
    });
    expect(createDirectPurchaseOrderForCurrentBuyerMock).not.toHaveBeenCalled();
  });

  it("creates an order with normalized input when authenticated", async () => {
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "user_123" });
    createDirectPurchaseOrderForCurrentBuyerMock.mockResolvedValue({ id: "order_123" });
    const { POST } = await import("@/app/api/marketplace/orders/route");

    const response = await POST(
      new Request("https://example.com/api/marketplace/orders", {
        method: "POST",
        body: JSON.stringify({ licenseOfferingId: " offering_123 " }),
      }),
    );

    expect(response.status).toBe(201);
    expect(createDirectPurchaseOrderForCurrentBuyerMock).toHaveBeenCalledWith("user_123", {
      beatSlug: undefined,
      licenseOfferingId: "offering_123",
    });
    expect(await response.json()).toEqual({ id: "order_123" });
  });
});
