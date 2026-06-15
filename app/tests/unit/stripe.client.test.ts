import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkoutSessionsCreate: vi.fn(),
  stripeConstructor: vi.fn(),
}));

vi.mock("stripe", () => ({
  default: class StripeMock {
    checkout = {
      sessions: {
        create: mocks.checkoutSessionsCreate,
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
});
