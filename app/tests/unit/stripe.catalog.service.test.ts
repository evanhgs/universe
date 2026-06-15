import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    beat: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    beatLicenseOffering: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  stripe: {
    products: {
      create: vi.fn(),
      update: vi.fn(),
    },
    prices: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => mocks.prisma,
}));

vi.mock("@/lib/stripe.client", () => ({
  getStripeClient: () => mocks.stripe,
}));

const catalogBeat = {
  id: "beat_1",
  ownerId: "seller_1",
  slug: "first-beat",
  title: "First Beat",
  description: "Dark trap beat",
  status: "DRAFT",
  stripeProductId: null,
  licenseOfferings: [
    {
      id: "offering_1",
      licenseTemplateId: "template_1",
      title: "MP3",
      priceAmount: { toString: () => "12.99" },
      currency: "EUR",
      isActive: true,
      stripePriceId: null,
      stripePriceActive: false,
      licenseTemplate: {
        id: "template_1",
        scope: "BASIC",
      },
    },
  ],
};

describe("stripe catalog service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.beat.update.mockResolvedValue({});
    mocks.prisma.beatLicenseOffering.update.mockResolvedValue({});
    mocks.prisma.beatLicenseOffering.updateMany.mockResolvedValue({ count: 0 });
    mocks.stripe.products.create.mockResolvedValue({ id: "prod_1" });
    mocks.stripe.products.update.mockResolvedValue({ id: "prod_1" });
    mocks.stripe.prices.create.mockResolvedValue({ id: "price_1" });
    mocks.stripe.prices.update.mockResolvedValue({ id: "price_old" });
  });

  it("creates a Stripe Product and Price for a beat without forcing local ids", async () => {
    mocks.prisma.beat.findUnique.mockResolvedValue(catalogBeat);

    const { syncStripeCatalogForBeat } = await import(
      "@/server/beats/stripe.catalog.service"
    );

    await syncStripeCatalogForBeat("beat_1");

    expect(mocks.stripe.products.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "First Beat",
        metadata: {
          beatId: "beat_1",
          ownerId: "seller_1",
          slug: "first-beat",
        },
        tax_code: "txcd_10000000",
      }),
    );
    expect(mocks.stripe.products.create.mock.calls[0][0]).not.toHaveProperty("id");
    expect(mocks.stripe.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({
        product: "prod_1",
        unit_amount: 1299,
        currency: "eur",
        tax_behavior: "exclusive",
      }),
    );
    expect(mocks.prisma.beatLicenseOffering.update).toHaveBeenCalledWith({
      where: { id: "offering_1" },
      data: {
        stripePriceId: "price_1",
        stripePriceActive: true,
      },
    });
  });

  it("keeps a failed Stripe sync as a draft beat", async () => {
    mocks.prisma.beat.findUnique.mockResolvedValue(catalogBeat);
    mocks.stripe.products.create.mockRejectedValue(new Error("stripe_down"));

    const { syncStripeCatalogForBeat } = await import(
      "@/server/beats/stripe.catalog.service"
    );

    await expect(syncStripeCatalogForBeat("beat_1")).rejects.toThrow("stripe_down");
    expect(mocks.prisma.beat.update).toHaveBeenCalledWith({
      where: { id: "beat_1" },
      data: {
        status: "DRAFT",
        stripeSyncStatus: "FAILED",
        stripeSyncError: "stripe_down",
        stripeSyncedAt: null,
      },
    });
  });

  it("replaces an existing Price and archives the previous one", async () => {
    mocks.prisma.beatLicenseOffering.findUnique.mockResolvedValue({
      ...catalogBeat.licenseOfferings[0],
      beat: {
        ...catalogBeat,
        stripeProductId: "prod_1",
      },
      stripePriceId: "price_old",
      stripePriceActive: true,
    });

    const { replaceStripePriceForOffering } = await import(
      "@/server/beats/stripe.catalog.service"
    );

    await replaceStripePriceForOffering("offering_1");

    expect(mocks.stripe.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({
        product: "prod_1",
        unit_amount: 1299,
      }),
    );
    expect(mocks.stripe.prices.update).toHaveBeenCalledWith("price_old", {
      active: false,
    });
  });
});
