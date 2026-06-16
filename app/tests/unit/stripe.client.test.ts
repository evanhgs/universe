import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkoutSessionsCreate: vi.fn(),
  portalSessionsCreate: vi.fn(),
  stripeConstructor: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    checkout = {
      sessions: {
        create: mocks.checkoutSessionsCreate,
      },
    };
    billingPortal = {
      sessions: {
        create: mocks.portalSessionsCreate,
      },
    };

    constructor(...args: unknown[]) {
      mocks.stripeConstructor(...args);
    }
  },
}));

describe("stripe client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    mocks.checkoutSessionsCreate.mockResolvedValue({ id: "cs_123" });
    mocks.portalSessionsCreate.mockResolvedValue({ url: "https://stripe.test/portal" });
  });

  it("creates Checkout Sessions with catalog Price ids", async () => {
    const { createStripeCheckoutSession } = await import("@/lib/stripe.client");

    await createStripeCheckoutSession({
      orderId: "order_1",
      paymentId: "payment_1",
      buyerId: "buyer_1",
      stripePriceIdSnapshots: ["price_123"],
      successUrl: "https://universe.test/success",
      cancelUrl: "https://universe.test/cancel",
    });

    expect(mocks.checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          {
            price: "price_123",
            quantity: 1,
          },
        ],
      }),
    );
    expect(mocks.checkoutSessionsCreate.mock.calls[0][0].line_items[0]).not.toHaveProperty(
      "price_data",
    );
  });

  it("creates subscription Checkout Sessions for Universe Billing", async () => {
    const { createStripeSubscriptionCheckoutSession } = await import("@/lib/stripe.client");

    await createStripeSubscriptionCheckoutSession({
      customerId: "cus_123",
      userId: "user_123",
      planCode: "universe_monthly",
      priceId: "price_monthly",
      successUrl: "https://universe.test/pricing?success=1",
      cancelUrl: "https://universe.test/pricing?cancelled=1",
    });

    expect(mocks.checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_123",
        line_items: [{ price: "price_monthly", quantity: 1 }],
        metadata: {
          purpose: "universe_subscription",
          userId: "user_123",
          planCode: "universe_monthly",
        },
      }),
    );
  });

  it("creates Stripe Customer Portal sessions", async () => {
    const { createStripeBillingPortalSession } = await import("@/lib/stripe.client");

    await createStripeBillingPortalSession({
      customerId: "cus_123",
      returnUrl: "https://universe.test/pricing",
    });

    expect(mocks.portalSessionsCreate).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "https://universe.test/pricing",
    });
  });
});
