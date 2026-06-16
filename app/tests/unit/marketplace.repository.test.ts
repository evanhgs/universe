import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    order: {
      create: vi.fn(),
    },
    orderItem: {
      count: vi.fn(),
    },
    userProfile: {
      update: vi.fn(),
    },
    userSubscription: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => mocks.prisma,
}));

describe("marketplace repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.order.create.mockResolvedValue({ id: "order_1" });
    mocks.prisma.orderItem.count.mockResolvedValue(0);
    mocks.prisma.userProfile.update.mockResolvedValue({});
    mocks.prisma.userSubscription.findFirst.mockResolvedValue(null);
  });

  const offering = {
    id: "offering_1",
    sellerId: "seller_1",
    title: "MP3",
    priceAmount: { toString: () => "20" },
    currency: "EUR",
    stripePriceId: "price_123",
    customTermsJson: null,
    beat: {
      id: "beat_1",
      slug: "first-beat",
      title: "First Beat",
      ownerId: "seller_1",
    },
    licenseTemplate: {
      code: "basic",
      name: "Basic",
      scope: "BASIC",
      allowStreaming: true,
      allowCommercialUse: true,
      allowBroadcast: false,
      allowDistribution: false,
      allowExclusiveTransfer: false,
      allowStemsDownload: false,
      maxStreams: null,
      maxSales: null,
      maxMusicVideos: null,
      maxRadioStations: null,
    },
  };

  it("snapshots the Stripe Price and default commission rate used by an order item", async () => {
    const { createOrderForOffering } = await import(
      "@/server/marketplace/marketplace.repository"
    );

    await createOrderForOffering({
      buyerId: "buyer_1",
      offering: offering as never,
    });

    expect(mocks.prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          commissionAmount: 6,
          items: {
            create: expect.objectContaining({
              stripePriceIdSnapshot: "price_123",
              commissionRateBpSnapshot: 3000,
            }),
          },
        }),
      }),
    );
  });

  it("snapshots a reduced commission rate for premium sellers", async () => {
    mocks.prisma.userSubscription.findFirst.mockResolvedValue({
      plan: {
        reducedCommissionRateBp: 900,
      },
    });
    const { createOrderForOffering } = await import(
      "@/server/marketplace/marketplace.repository"
    );

    await createOrderForOffering({
      buyerId: "buyer_1",
      offering: offering as never,
    });

    expect(mocks.prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          commissionAmount: 1.8,
          items: {
            create: expect.objectContaining({
              commissionRateBpSnapshot: 900,
            }),
          },
        }),
      }),
    );
  });

  it("uses the commission snapshot during Stripe fulfillment", async () => {
    const createManyMock = vi.fn();
    const tx = {
      order: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValueOnce({
            id: "order_1",
            buyerId: "buyer_1",
            currency: "EUR",
            status: "PENDING_PAYMENT",
            items: [
              {
                id: "item_1",
                sellerId: "seller_1",
                beatId: "beat_1",
                beatLicenseOfferingId: "offering_1",
                lineTotalAmount: { toString: () => "100" },
                commissionRateBpSnapshot: 900,
                rightsSnapshotJson: {},
              },
            ],
          })
          .mockResolvedValueOnce({
            id: "order_1",
            items: [{ seller: null }],
          }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      payment: {
        update: vi.fn().mockResolvedValue({}),
      },
      purchaseEntitlement: {
        upsert: vi.fn().mockResolvedValue({}),
      },
      payoutLedgerEntry: {
        createMany: createManyMock.mockResolvedValue({ count: 3 }),
      },
    };
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    const { markOrderPaidFromStripe } = await import(
      "@/server/marketplace/marketplace.repository"
    );

    await markOrderPaidFromStripe({
      orderId: "order_1",
      paymentId: "payment_1",
      taxAmount: 0,
      totalAmount: 100,
      payload: {},
    });

    expect(createManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            type: "PLATFORM_COMMISSION",
            amount: -9,
            description: "Platform commission 9%",
          }),
          expect.objectContaining({
            type: "SELLER_EARNING",
            amount: 91,
          }),
        ]),
      }),
    );
  });
});
