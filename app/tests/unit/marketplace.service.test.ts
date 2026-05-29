import { beforeEach, describe, expect, it, vi } from "vitest";

const syncCurrentAccountFromClerkMock = vi.fn();
const findDownloadEntitlementMock = vi.fn();
const incrementEntitlementDownloadCountMock = vi.fn();
const createProtectedAssetUrlMock = vi.fn();

vi.mock("@/server/account/account.sync", () => ({
  syncCurrentAccountFromClerk: syncCurrentAccountFromClerkMock,
}));

vi.mock("@/server/storage/s3", () => ({
  createProtectedAssetUrl: createProtectedAssetUrlMock,
}));

vi.mock("@/server/marketplace/marketplace.repository", () => ({
  attachStripeSessionToPayment: vi.fn(),
  countPaidSellerOrderItemsByBeat: vi.fn(),
  createOrderForOffering: vi.fn(),
  createPendingStripePayment: vi.fn(),
  findActiveEntitlementForOffering: vi.fn(),
  findBuyerOrder: vi.fn(),
  findDownloadEntitlement: findDownloadEntitlementMock,
  findLatestPendingStripePayment: vi.fn(),
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
  markWebhookEventProcessed: vi.fn(),
  recordWebhookEventStart: vi.fn(),
}));

vi.mock("@/server/marketplace/stripe.client", () => ({
  createStripeCheckoutSession: vi.fn(),
  retrieveStripeCheckoutSession: vi.fn(),
}));

vi.mock("@/server/email/email.service", () => ({
  emailService: {
    sendOrderConfirmedEmails: vi.fn(),
  },
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
});
