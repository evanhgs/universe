import "server-only";

import type Stripe from "stripe";

import { getPrisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe.client";

import { Prisma } from "../../../generated/prisma/client";
import { STRIPE_DIGITAL_SERVICE_TAX_CODE } from "./beat.constants";

type CatalogBeat = NonNullable<Awaited<ReturnType<typeof loadCatalogBeat>>>;

type SyncStripeCatalogOptions = {
  dryRun?: boolean;
};

/**
 * Convertit un Decimal Prisma en number nullable.
 */
function decimalToNumber(value: Prisma.Decimal | number | null) {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value.toString());
}

/**
 * Convertit un montant metier en unite mineure Stripe.
 */
function toMinorUnitAmount(value: Prisma.Decimal | number | null) {
  return Math.round((decimalToNumber(value) ?? 0) * 100);
}

function stripeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 2_000) : "stripe_catalog_sync_failed";
}

function shouldActivateProduct(beat: Pick<CatalogBeat, "status">) {
  return beat.status === "PUBLISHED" || beat.status === "PROCESSING" || beat.status === "DRAFT";
}

function humanizeEnum(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDuration(seconds: number | null) {
  if (!seconds) {
    return null;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function joinEnumValues(values: string[]) {
  return values.length > 0 ? values.map(humanizeEnum).join(", ") : null;
}

function productDescription(beat: CatalogBeat) {
  const details = [
    beat.description,
    beat.bpm ? `BPM: ${beat.bpm}` : null,
    beat.musicalKey ? `Tonalite: ${beat.musicalKey}` : null,
    formatDuration(beat.durationSec) ? `Duree: ${formatDuration(beat.durationSec)}` : null,
    joinEnumValues(beat.mainGenres) ? `Genres: ${joinEnumValues(beat.mainGenres)}` : null,
    joinEnumValues(beat.moods) ? `Moods: ${joinEnumValues(beat.moods)}` : null,
    joinEnumValues(beat.tags) ? `Tags: ${joinEnumValues(beat.tags)}` : null,
  ].filter((value): value is string => Boolean(value));

  return details.length > 0 ? details.join("\n") : undefined;
}

function productMetadata(
  beat: Pick<
    CatalogBeat,
    "id" | "ownerId" | "slug" | "title" | "bpm" | "musicalKey" | "durationSec"
  >,
) {
  return {
    beatId: beat.id,
    ownerId: beat.ownerId,
    slug: beat.slug,
    title: beat.title,
    bpm: beat.bpm ? String(beat.bpm) : "",
    musicalKey: beat.musicalKey ?? "",
    durationSec: beat.durationSec ? String(beat.durationSec) : "",
  };
}

function priceMetadata(
  beat: Pick<CatalogBeat, "id" | "ownerId">,
  offering: CatalogBeat["licenseOfferings"][number],
) {
  return {
    beatId: beat.id,
    offeringId: offering.id,
    ownerId: beat.ownerId,
    licenseTemplateId: offering.licenseTemplateId,
    licenseScope: offering.licenseTemplate.scope,
  };
}

async function loadCatalogBeat(beatId: string) {
  return getPrisma().beat.findUnique({
    where: { id: beatId },
    include: {
      licenseOfferings: {
        orderBy: [{ isDefault: "desc" }, { priceAmount: "asc" }],
        include: {
          licenseTemplate: {
            select: {
              id: true,
              scope: true,
            },
          },
        },
      },
    },
  });
}

async function markCatalogFailed(beatId: string, error: unknown) {
  await getPrisma().beat.update({
    where: { id: beatId },
    data: {
      status: "DRAFT",
      stripeSyncStatus: "FAILED",
      stripeSyncError: stripeErrorMessage(error),
      stripeSyncedAt: null,
    },
  });
}

async function createOrUpdateProduct(stripe: Stripe, beat: CatalogBeat) {
  const data = {
    name: beat.title,
    description: productDescription(beat),
    active: shouldActivateProduct(beat),
    metadata: productMetadata(beat),
    tax_code: STRIPE_DIGITAL_SERVICE_TAX_CODE,
  } satisfies Stripe.ProductUpdateParams;

  if (beat.stripeProductId) {
    return stripe.products.update(beat.stripeProductId, data);
  }

  return stripe.products.create(data);
}

async function replaceOfferingPrice(args: {
  stripe: Stripe;
  productId: string;
  beat: CatalogBeat;
  offering: CatalogBeat["licenseOfferings"][number];
}) {
  const { stripe, productId, beat, offering } = args;

  if (offering.stripePriceId && offering.stripePriceActive) {
    return offering.stripePriceId;
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: toMinorUnitAmount(offering.priceAmount),
    currency: offering.currency.toLowerCase(),
    tax_behavior: "exclusive",
    nickname: offering.title ?? offering.licenseTemplate.scope,
    active: offering.isActive,
    metadata: priceMetadata(beat, offering),
  });

  if (offering.stripePriceId && offering.stripePriceId !== price.id) {
    await stripe.prices.update(offering.stripePriceId, { active: false });
  }

  return price.id;
}

/**
 * Synchronise un beat local avec le catalogue Stripe Product/Price.
 */
export async function syncStripeCatalogForBeat(
  beatId: string,
  options: SyncStripeCatalogOptions = {},
) {
  const beat = await loadCatalogBeat(beatId);

  if (!beat || beat.status === "DELETED") {
    throw new Error("beat_not_found");
  }

  const activeOfferings = beat.licenseOfferings.filter((offering) => offering.isActive);

  if (options.dryRun) {
    return {
      beatId: beat.id,
      dryRun: true,
      wouldCreateProduct: !beat.stripeProductId,
      activeOfferingCount: activeOfferings.length,
      missingPriceCount: activeOfferings.filter((offering) => !offering.stripePriceId).length,
    };
  }

  const prisma = getPrisma();

  await prisma.beat.update({
    where: { id: beat.id },
    data: {
      stripeSyncStatus: "SYNCING",
      stripeSyncError: null,
    },
  });

  try {
    const stripe = getStripeClient();
    const product = await createOrUpdateProduct(stripe, beat);

    await prisma.beat.update({
      where: { id: beat.id },
      data: {
        stripeProductId: product.id,
      },
    });

    for (const offering of activeOfferings) {
      const priceId = await replaceOfferingPrice({
        stripe,
        productId: product.id,
        beat,
        offering,
      });

      await prisma.beatLicenseOffering.update({
        where: { id: offering.id },
        data: {
          stripePriceId: priceId,
          stripePriceActive: true,
        },
      });
    }

    const inactiveOfferings = beat.licenseOfferings.filter(
      (offering) => !offering.isActive && offering.stripePriceId && offering.stripePriceActive,
    );

    for (const offering of inactiveOfferings) {
      await stripe.prices.update(offering.stripePriceId as string, { active: false });
    }

    if (inactiveOfferings.length > 0) {
      await prisma.beatLicenseOffering.updateMany({
        where: {
          id: {
            in: inactiveOfferings.map((offering) => offering.id),
          },
        },
        data: { stripePriceActive: false },
      });
    }

    await prisma.beat.update({
      where: { id: beat.id },
      data: {
        stripeSyncStatus: "SYNCED",
        stripeSyncedAt: new Date(),
        stripeSyncError: null,
      },
    });

    return {
      beatId: beat.id,
      dryRun: false,
      productId: product.id,
      activeOfferingCount: activeOfferings.length,
    };
  } catch (error) {
    await markCatalogFailed(beat.id, error);
    throw error;
  }
}

/**
 * Remplace le Price Stripe d'une offre apres changement de prix ou devise.
 */
export async function replaceStripePriceForOffering(offeringId: string) {
  const prisma = getPrisma();
  const offering = await prisma.beatLicenseOffering.findUnique({
    where: { id: offeringId },
    include: {
      beat: true,
      licenseTemplate: {
        select: {
          id: true,
          scope: true,
        },
      },
    },
  });

  if (!offering || offering.beat.status === "DELETED") {
    throw new Error("beat_or_license_not_found");
  }

  if (!offering.beat.stripeProductId) {
    await syncStripeCatalogForBeat(offering.beat.id);
    return;
  }

  await prisma.beat.update({
    where: { id: offering.beat.id },
    data: {
      stripeSyncStatus: "SYNCING",
      stripeSyncError: null,
    },
  });

  try {
    const stripe = getStripeClient();
    const price = await stripe.prices.create({
      product: offering.beat.stripeProductId,
      unit_amount: toMinorUnitAmount(offering.priceAmount),
      currency: offering.currency.toLowerCase(),
      tax_behavior: "exclusive",
      nickname: offering.title ?? offering.licenseTemplate.scope,
      active: offering.isActive,
      metadata: {
        beatId: offering.beat.id,
        offeringId: offering.id,
        ownerId: offering.beat.ownerId,
        licenseTemplateId: offering.licenseTemplateId,
        licenseScope: offering.licenseTemplate.scope,
      },
    });

    if (offering.stripePriceId) {
      await stripe.prices.update(offering.stripePriceId, { active: false });
    }

    await prisma.beatLicenseOffering.update({
      where: { id: offering.id },
      data: {
        stripePriceId: price.id,
        stripePriceActive: offering.isActive,
      },
    });

    await prisma.beat.update({
      where: { id: offering.beat.id },
      data: {
        stripeSyncStatus: "SYNCED",
        stripeSyncedAt: new Date(),
        stripeSyncError: null,
      },
    });
  } catch (error) {
    await markCatalogFailed(offering.beat.id, error);
    throw error;
  }
}

/**
 * Verifie qu'un beat peut etre publie et vendu via Stripe Checkout.
 */
export async function assertStripeCatalogReadyForPublication(beatId: string) {
  const beat = await getPrisma().beat.findUnique({
    where: { id: beatId },
    select: {
      stripeProductId: true,
      stripeSyncStatus: true,
      licenseOfferings: {
        where: { isActive: true },
        select: {
          stripePriceId: true,
          stripePriceActive: true,
        },
      },
    },
  });

  if (
    !beat?.stripeProductId ||
    beat.stripeSyncStatus !== "SYNCED" ||
    beat.licenseOfferings.length === 0 ||
    beat.licenseOfferings.some((offering) => !offering.stripePriceId || !offering.stripePriceActive)
  ) {
    throw new Error("stripe_catalog_not_ready");
  }
}

/**
 * Desactive le Product Stripe et les Prices actives d'un beat soft-delete.
 */
export async function deactivateStripeCatalogForBeat(beatId: string) {
  const beat = await loadCatalogBeat(beatId);

  if (!beat?.stripeProductId) {
    return;
  }

  const stripe = getStripeClient();

  await stripe.products.update(beat.stripeProductId, { active: false });

  for (const offering of beat.licenseOfferings) {
    if (offering.stripePriceId && offering.stripePriceActive) {
      await stripe.prices.update(offering.stripePriceId, { active: false });
    }
  }

  await getPrisma().beatLicenseOffering.updateMany({
    where: { beatId, stripePriceActive: true },
    data: { stripePriceActive: false },
  });
}

/**
 * Liste les beats candidats a une resynchronisation catalogue.
 */
export async function listStripeCatalogSyncCandidates(beatId?: string) {
  return getPrisma().beat.findMany({
    where: beatId
      ? { id: beatId }
      : {
          status: { not: "DELETED" },
          OR: [
            { stripeProductId: null },
            { stripeSyncStatus: { in: ["NOT_SYNCED", "FAILED"] } },
            {
              licenseOfferings: {
                some: {
                  isActive: true,
                  OR: [{ stripePriceId: null }, { stripePriceActive: false }],
                },
              },
            },
          ],
        },
    select: {
      id: true,
      slug: true,
      stripeSyncStatus: true,
      stripeProductId: true,
    },
    orderBy: { createdAt: "asc" },
  });
}
