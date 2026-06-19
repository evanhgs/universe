import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const checkoutMock = vi.fn();
const portalMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/server/security/rate-limit", () => ({
  enforceRateLimit: vi.fn(() => null),
  RATE_LIMITS: {
    marketplaceWrite: {},
  },
}));

vi.mock("@/server/subscriptions/subscription.service", () => ({
  createUniverseSubscriptionCheckoutForCurrentUser: checkoutMock,
  createUniverseSubscriptionPortalForCurrentUser: portalMock,
}));

describe("subscription API routes", () => {
  beforeEach(() => {
    authMock.mockReset();
    checkoutMock.mockReset();
    portalMock.mockReset();
  });

  it("rejects subscription checkout when unauthenticated", async () => {
    authMock.mockResolvedValue({ isAuthenticated: false, userId: null });
    const { POST } = await import("@/app/api/subscriptions/checkout/stripe/route");

    const response = await POST(
      new Request("https://universe.test/api/subscriptions/checkout/stripe", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(checkoutMock).not.toHaveBeenCalled();
  });

  it("creates a subscription checkout session for authenticated users", async () => {
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "clerk_1" });
    checkoutMock.mockResolvedValue({ checkoutUrl: "https://stripe.test/checkout" });
    const { POST } = await import("@/app/api/subscriptions/checkout/stripe/route");

    const response = await POST(
      new Request("https://universe.test/api/subscriptions/checkout/stripe", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(checkoutMock).toHaveBeenCalledWith(
      "clerk_1",
      "https://universe.test/api/subscriptions/checkout/stripe",
    );
    expect(await response.json()).toEqual({ checkoutUrl: "https://stripe.test/checkout" });
  });

  it("returns 409 when the user already has a subscription", async () => {
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "user_123" });
    checkoutMock.mockRejectedValue(new Error("subscription_already_active"));
    const { POST } = await import("@/app/api/subscriptions/checkout/stripe/route");

    const response = await POST(
      new Request("https://universe.test/api/subscriptions/checkout/stripe", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "subscription_already_active",
    });
  });

  it("creates a Customer Portal session for authenticated users", async () => {
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "clerk_1" });
    portalMock.mockResolvedValue({ portalUrl: "https://stripe.test/portal" });
    const { POST } = await import("@/app/api/subscriptions/portal/stripe/route");

    const response = await POST(
      new Request("https://universe.test/api/subscriptions/portal/stripe", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(portalMock).toHaveBeenCalledWith(
      "clerk_1",
      "https://universe.test/api/subscriptions/portal/stripe",
    );
    expect(await response.json()).toEqual({ portalUrl: "https://stripe.test/portal" });
  });
});
