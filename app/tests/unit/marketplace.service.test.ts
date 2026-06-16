import { beforeEach, describe, expect, it, vi } from "vitest";

const syncCurrentAccountFromClerkMock = vi.fn();
const findDownloadEntitlementMock = vi.fn();
const incrementEntitlementDownloadCountMock = vi.fn();
const createProtectedAssetUrlMock = vi.fn();
const findBuyerOrderMock = vi.fn();
const createPendingStripePaymentMock = vi.fn();
const findLatestPendingStripePaymentMock = vi.fn();
const attachStripeSessionToPaymentMock = vi.fn();
const createStripeCheckoutSessionMock = vi.fn();
const retrieveStripeCheckoutSessionMock = vi.fn();
const recordWebhookEventStartMock = vi.fn();
const markWebhookEventProcessedMock = vi.fn();
const handleSubscriptionCheckoutMock = vi.fn();
const isSubscriptionCheckoutMock = vi.fn();

vi.mock("@/server/account/account.sync", () => ({
  syncCurrentAccountFromClerk: syncCurrentAccountFromClerkMock,
}));

vi.mock("@/server/storage/s3", () => ({
  createProtectedAssetUrl: createProtectedAssetUrlMock,
}));

vi.mock("@/server/marketplace/marketplace.repository", () => ({
  attachStripeSessionToPayment: attachStripeSessionToPaymentMock,
  countPaidSellerOrderItemsByBeat: vi.fn(),
  createOrderForOffering: vi.fn(),
  createPendingStripePayment: createPendingStripePaymentMock,
  findActiveEntitlementForOffering: vi.fn(),
  findBuyerOrder: findBuyerOrderMock,
  findDownloadEntitlement: findDownloadEntitlementMock,
  findLatestKycVerificationForUser: vi.fn(),
  findLatestPendingStripePayment: findLatestPendingStripePaymentMock,
  findPurchasableOffering: vi.fn(),
  findStripePaymentForConfirmation: vi.fn(),
  incrementEntitlementDownloadCount: incrementEntitlementDownloadCountMock,
  listBuyerOrders: vi.fn(),
  listSellerBeats: vi.fn(),
  listSellerOrderItems: vi.fn(),
  listSellerRevenueLedgerEntries: vi.fn(),
  markOrderPaidFromStripe: vi.fn(),
  markStripePaymentFailedBySession: vi.fn(),
  markWebhookEventFailed: vi.fn(),
  markWebhookEventProcessed: markWebhookEventProcessedMock,
  recordWebhookEventStart: recordWebhookEventStartMock,
}));

vi.mock("@/lib/stripe.client", () => ({
  createStripeCheckoutSession: createStripeCheckoutSessionMock,
  retrieveStripeCheckoutSession: retrieveStripeCheckoutSessionMock,
}));

vi.mock("@/server/email/email.service", () => ({
  emailService: {
    sendOrderConfirmedEmails: vi.fn(),
  },
}));

vi.mock("@/server/subscriptions/subscription.service", () => ({
  handleStripeSubscriptionCheckoutCompleted: handleSubscriptionCheckoutMock,
  handleStripeSubscriptionInvoicePaymentFailed: vi.fn(),
  isStripeSubscriptionCheckoutSession: isSubscriptionCheckoutMock,
  syncStripeSubscription: vi.fn(),
}));

describe("marketplace service", () => {
  beforeEach(() => {
    syncCurrentAccountFromClerkMock.mockReset().mockResolvedValue({
      id: "buyer_current",
      clerkUserId: "clerk_current",
    });
    findDownloadEntitlementMock.mockReset();
    incrementEntitlementDownloadCountMock.mockReset();
    createProtectedAssetUrlMock.mockReset();
    findBuyerOrderMock.mockReset();
    createPendingStripePaymentMock.mockReset();
    findLatestPendingStripePaymentMock.mockReset();
    attachStripeSessionToPaymentMock.mockReset();
    createStripeCheckoutSessionMock.mockReset();
    retrieveStripeCheckoutSessionMock.mockReset();
    recordWebhookEventStartMock.mockReset().mockResolvedValue({ alreadyProcessed: false });
    markWebhookEventProcessedMock.mockReset().mockResolvedValue({});
    handleSubscriptionCheckoutMock.mockReset().mockResolvedValue({ id: "sub_local_1" });
    isSubscriptionCheckoutMock.mockReset().mockReturnValue(false);
  });

  it("rejects a download entitlement whose buyerId does not match the current account", async () => {
    findDownloadEntitlementMock.mockResolvedValue({
      id: "entitlement_123",
      buyerId: "buyer_other",
      beat: {
        id: "beat_123",
        slug: "beat-one",
        title: "Beat One",
        assets: [],
      },
    });
    const { getDownloadAccessForCurrentBuyer } = await import(
      "@/server/marketplace/marketplace.service"
    );

    await expect(
      getDownloadAccessForCurrentBuyer("clerk_current", "entitlement_123"),
    ).rejects.toThrow("entitlement_not_found");
    expect(incrementEntitlementDownloadCountMock).not.toHaveBeenCalled();
    expect(createProtectedAssetUrlMock).not.toHaveBeenCalled();
  });

  it("creates Checkout with a snapshotted Stripe Price", async () => {
    findBuyerOrderMock.mockResolvedValue({
      id: "order_1",
      status: "PENDING_PAYMENT",
      currency: "EUR",
      totalAmount: { toString: () => "20" },
      items: [
        {
          titleSnapshot: "First Beat",
          stripePriceIdSnapshot: "price_123",
        },
      ],
    });
    findLatestPendingStripePaymentMock.mockResolvedValue(null);
    createPendingStripePaymentMock.mockResolvedValue({ id: "payment_1" });
    createStripeCheckoutSessionMock.mockResolvedValue({
      id: "cs_123",
      url: "https://checkout.stripe.test/session",
      payment_intent: "pi_123",
    });

    const { createStripeCheckoutForCurrentBuyer } = await import(
      "@/server/marketplace/marketplace.service"
    );

    await expect(
      createStripeCheckoutForCurrentBuyer(
        "clerk_current",
        "order_1",
        {},
        "https://universe.test/api/marketplace/orders/order_1/checkout/stripe",
      ),
    ).resolves.toMatchObject({
      checkoutSessionId: "cs_123",
      checkoutUrl: "https://checkout.stripe.test/session",
    });

    expect(createStripeCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stripePriceIdSnapshots: ["price_123"],
      }),
    );
  });

  it("rejects Checkout when the order has no Stripe Price snapshot", async () => {
    findBuyerOrderMock.mockResolvedValue({
      id: "order_1",
      status: "PENDING_PAYMENT",
      currency: "EUR",
      totalAmount: { toString: () => "20" },
      items: [
        {
          titleSnapshot: "First Beat",
          stripePriceIdSnapshot: null,
        },
      ],
    });
    findLatestPendingStripePaymentMock.mockResolvedValue(null);
    createPendingStripePaymentMock.mockResolvedValue({ id: "payment_1" });

    const { createStripeCheckoutForCurrentBuyer } = await import(
      "@/server/marketplace/marketplace.service"
    );

    await expect(
      createStripeCheckoutForCurrentBuyer(
        "clerk_current",
        "order_1",
        {},
        "https://universe.test/api/marketplace/orders/order_1/checkout/stripe",
      ),
    ).rejects.toThrow("stripe_price_missing");
    expect(createStripeCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("routes subscription Checkout webhooks to the subscription handler", async () => {
    isSubscriptionCheckoutMock.mockReturnValue(true);
    const session = {
      id: "cs_sub_123",
      mode: "subscription",
      metadata: { purpose: "universe_subscription" },
    };
    const { handleStripeCheckoutWebhookEvent } = await import(
      "@/server/marketplace/marketplace.service"
    );

    await handleStripeCheckoutWebhookEvent({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: session },
    } as never);

    expect(handleSubscriptionCheckoutMock).toHaveBeenCalledWith(session);
    expect(markWebhookEventProcessedMock).toHaveBeenCalledWith({
      provider: "STRIPE",
      eventId: "evt_1",
    });
  });
});
