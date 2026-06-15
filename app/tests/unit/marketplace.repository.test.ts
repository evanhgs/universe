import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    order: {
      create: vi.fn(),
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
  });

  it("snapshots the Stripe Price used by an order item", async () => {
    const { createOrderForOffering } = await import(
      "@/server/marketplace/marketplace.repository"
    );

    await createOrderForOffering({
      buyerId: "buyer_1",
      offering: {
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
      } as never,
    });

    expect(mocks.prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: expect.objectContaining({
              stripePriceIdSnapshot: "price_123",
            }),
          },
        }),
      }),
    );
  });
});
