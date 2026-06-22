import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    beat: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    userProfile: {
      update: vi.fn(),
    },
  },
  assertReady: vi.fn(),
  syncCatalog: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => mocks.prisma,
}));

vi.mock("@/server/beats/stripe.catalog.service", () => ({
  assertStripeCatalogReadyForPublication: mocks.assertReady,
  syncStripeCatalogForBeat: mocks.syncCatalog,
  deactivateStripeCatalogForBeat: vi.fn(),
  replaceStripePriceForOffering: vi.fn(),
}));

vi.mock("@/server/storage/s3", () => ({
  createStorageObjectKey: vi.fn(),
}));

import {
  cancelBeatPublicationSchedule,
  publishDueScheduledBeats,
  scheduleBeatPublication,
} from "@/server/beats/beat.repository";

describe("scheduleBeatPublication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertReady.mockResolvedValue(undefined);
    mocks.prisma.beat.update.mockResolvedValue({ id: "beat_1" });
  });

  const scheduledAt = new Date("2026-06-30T10:00:00.000Z");

  it("marks a ready draft as SCHEDULED + PRIVATE and stores the drop date", async () => {
    mocks.prisma.beat.findUnique.mockResolvedValue({
      id: "beat_1",
      ownerId: "seller_1",
      status: "DRAFT",
    });

    await scheduleBeatPublication("seller_1", "first-beat", scheduledAt);

    expect(mocks.assertReady).toHaveBeenCalledWith("beat_1");
    expect(mocks.prisma.beat.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "beat_1" },
        data: {
          status: "SCHEDULED",
          visibility: "PRIVATE",
          scheduledPublishAt: scheduledAt,
        },
      }),
    );
  });

  it("returns null when the beat does not exist", async () => {
    mocks.prisma.beat.findUnique.mockResolvedValue(null);

    await expect(scheduleBeatPublication("seller_1", "ghost", scheduledAt)).resolves.toBeNull();
    expect(mocks.prisma.beat.update).not.toHaveBeenCalled();
  });

  it("forbids scheduling a beat owned by someone else", async () => {
    mocks.prisma.beat.findUnique.mockResolvedValue({
      id: "beat_1",
      ownerId: "other_seller",
      status: "DRAFT",
    });

    await expect(scheduleBeatPublication("seller_1", "first-beat", scheduledAt)).rejects.toThrow(
      "beat_forbidden",
    );
    expect(mocks.assertReady).not.toHaveBeenCalled();
    expect(mocks.prisma.beat.update).not.toHaveBeenCalled();
  });

  it("refuses to schedule an already published beat", async () => {
    mocks.prisma.beat.findUnique.mockResolvedValue({
      id: "beat_1",
      ownerId: "seller_1",
      status: "PUBLISHED",
    });

    await expect(scheduleBeatPublication("seller_1", "first-beat", scheduledAt)).rejects.toThrow(
      "beat_already_published",
    );
    expect(mocks.prisma.beat.update).not.toHaveBeenCalled();
  });

  it("refuses to schedule a beat that is not ready for Stripe publication", async () => {
    mocks.prisma.beat.findUnique.mockResolvedValue({
      id: "beat_1",
      ownerId: "seller_1",
      status: "DRAFT",
    });
    mocks.assertReady.mockRejectedValue(new Error("stripe_catalog_not_ready"));

    await expect(scheduleBeatPublication("seller_1", "first-beat", scheduledAt)).rejects.toThrow(
      "stripe_catalog_not_ready",
    );
    expect(mocks.prisma.beat.update).not.toHaveBeenCalled();
  });
});

describe("cancelBeatPublicationSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.beat.update.mockResolvedValue({ id: "beat_1" });
  });

  it("reverts a scheduled beat back to a private draft", async () => {
    mocks.prisma.beat.findUnique.mockResolvedValue({
      id: "beat_1",
      ownerId: "seller_1",
      status: "SCHEDULED",
    });

    await cancelBeatPublicationSchedule("seller_1", "first-beat");

    expect(mocks.prisma.beat.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "beat_1" },
        data: { status: "DRAFT", visibility: "PRIVATE", scheduledPublishAt: null },
      }),
    );
  });

  it("rejects cancelling a beat that is not scheduled", async () => {
    mocks.prisma.beat.findUnique.mockResolvedValue({
      id: "beat_1",
      ownerId: "seller_1",
      status: "PUBLISHED",
    });

    await expect(cancelBeatPublicationSchedule("seller_1", "first-beat")).rejects.toThrow(
      "beat_not_scheduled",
    );
  });
});

describe("publishDueScheduledBeats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertReady.mockResolvedValue(undefined);
    mocks.syncCatalog.mockResolvedValue(undefined);
    mocks.prisma.beat.count.mockResolvedValue(3);
    mocks.prisma.userProfile.update.mockResolvedValue({});
  });

  const now = new Date("2026-06-22T12:00:00.000Z");
  const dropAt = new Date("2026-06-22T11:00:00.000Z");

  it("publishes a due beat atomically and re-syncs the Stripe catalog", async () => {
    mocks.prisma.beat.findMany.mockResolvedValue([
      { id: "beat_1", ownerId: "seller_1", firstPublishedAt: null, scheduledPublishAt: dropAt },
    ]);
    mocks.prisma.beat.updateMany.mockResolvedValue({ count: 1 });

    const result = await publishDueScheduledBeats(now);

    expect(result).toMatchObject({ due: 1, published: 1, skipped: 0, failed: 0 });
    expect(mocks.prisma.beat.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "beat_1", status: "SCHEDULED" },
        data: expect.objectContaining({
          status: "PUBLISHED",
          visibility: "PUBLIC",
          publishedAt: dropAt,
          scheduledPublishAt: null,
          firstPublishedAt: dropAt,
        }),
      }),
    );
    expect(mocks.syncCatalog).toHaveBeenCalledWith("beat_1");
    expect(mocks.prisma.userProfile.update).toHaveBeenCalled();
  });

  it("preserves the original firstPublishedAt on a re-published beat", async () => {
    const firstPublishedAt = new Date("2026-01-01T00:00:00.000Z");
    mocks.prisma.beat.findMany.mockResolvedValue([
      { id: "beat_1", ownerId: "seller_1", firstPublishedAt, scheduledPublishAt: dropAt },
    ]);
    mocks.prisma.beat.updateMany.mockResolvedValue({ count: 1 });

    await publishDueScheduledBeats(now);

    expect(mocks.prisma.beat.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ firstPublishedAt: expect.anything() }),
      }),
    );
  });

  it("skips a beat already claimed by a concurrent run (claim count 0)", async () => {
    mocks.prisma.beat.findMany.mockResolvedValue([
      { id: "beat_1", ownerId: "seller_1", firstPublishedAt: null, scheduledPublishAt: dropAt },
    ]);
    mocks.prisma.beat.updateMany.mockResolvedValue({ count: 0 });

    const result = await publishDueScheduledBeats(now);

    expect(result).toMatchObject({ due: 1, published: 0, skipped: 1, failed: 0 });
    expect(mocks.syncCatalog).not.toHaveBeenCalled();
  });

  it("counts a not-ready beat as failed and leaves it scheduled", async () => {
    mocks.prisma.beat.findMany.mockResolvedValue([
      { id: "beat_1", ownerId: "seller_1", firstPublishedAt: null, scheduledPublishAt: dropAt },
    ]);
    mocks.assertReady.mockRejectedValue(new Error("stripe_catalog_not_ready"));

    const result = await publishDueScheduledBeats(now);

    expect(result).toMatchObject({ due: 1, published: 0, failed: 1 });
    expect(result.failures[0]).toMatchObject({ beatId: "beat_1", error: "stripe_catalog_not_ready" });
    expect(mocks.prisma.beat.updateMany).not.toHaveBeenCalled();
  });
});
