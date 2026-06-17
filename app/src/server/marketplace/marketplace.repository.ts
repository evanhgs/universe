import "server-only";

import { getPrisma } from "@/lib/prisma";

import { Prisma } from "../../../generated/prisma/client";
import {
  DEFAULT_DOWNLOAD_LIMIT,
  DEFAULT_PLATFORM_COMMISSION_RATE_BP,
} from "./marketplace.constants";
import type {
  CreateDirectPurchaseOrderInput,
  CreateExclusiveOfferInput,
  CreatePromotionInput,
  UpdateExclusiveOfferInput,
  UpdatePromotionInput,
} from "./marketplace.types";

const orderInclude = {
  items: {
    orderBy: {
      createdAt: "asc" as const,
    },
    include: {
      beat: {
        select: {
          id: true,
          slug: true,
          title: true,
        },
      },
      seller: {
        select: {
          id: true,
          profile: {
            select: {
              slug: true,
              displayName: true,
            },
          },
        },
      },
    },
  },
  payments: {
    orderBy: {
      createdAt: "desc" as const,
    },
  },
  entitlements: {
    orderBy: {
      createdAt: "asc" as const,
    },
  },
} as const;

/**
 * Arrondit un montant metier a deux decimales.
 * @param value Montant numerique.
 */
function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function commissionFromBp(amount: number, commissionRateBp: number) {
  return roundMoney(amount * (commissionRateBp / 10_000));
}

function commissionDescription(commissionRateBp: number) {
  return `Platform commission ${commissionRateBp / 100}%`;
}

function discountFromPromotion(args: {
  amount: number;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
}) {
  const discount = args.discountType === "PERCENT"
    ? args.amount * (args.discountValue / 100)
    : args.discountValue;

  return Math.min(args.amount, roundMoney(discount));
}

/**
 * Convertit un Decimal Prisma en number nullable.
 * @param value Montant Decimal, number ou null.
 */
function decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "number" ? value : Number(value.toString());
}

/**
 * Capture les droits de licence au moment de l'achat pour figer le contrat.
 * @param offering Offre purchasable chargee avec son template.
 * @returns Snapshot JSON des droits et conditions.
 */
function buildRightsSnapshot(offering: {
  customTermsJson: Prisma.JsonValue | null;
  licenseTemplate: {
    code: string;
    name: string;
    scope: string;
    allowStreaming: boolean;
    allowCommercialUse: boolean;
    allowBroadcast: boolean;
    allowDistribution: boolean;
    allowExclusiveTransfer: boolean;
    allowStemsDownload: boolean;
    maxStreams: number | null;
    maxSales: number | null;
    maxMusicVideos: number | null;
    maxRadioStations: number | null;
  };
} | null) {
  if (!offering) {
    return {};
  }

  return {
    licenseTemplate: {
      code: offering.licenseTemplate.code,
      name: offering.licenseTemplate.name,
      scope: offering.licenseTemplate.scope,
      allowStreaming: offering.licenseTemplate.allowStreaming,
      allowCommercialUse: offering.licenseTemplate.allowCommercialUse,
      allowBroadcast: offering.licenseTemplate.allowBroadcast,
      allowDistribution: offering.licenseTemplate.allowDistribution,
      allowExclusiveTransfer: offering.licenseTemplate.allowExclusiveTransfer,
      allowStemsDownload: offering.licenseTemplate.allowStemsDownload,
      maxStreams: offering.licenseTemplate.maxStreams,
      maxSales: offering.licenseTemplate.maxSales,
      maxMusicVideos: offering.licenseTemplate.maxMusicVideos,
      maxRadioStations: offering.licenseTemplate.maxRadioStations,
    },
    customTerms: offering.customTermsJson,
  };
}

/**
 * Recherche une offre de licence achetable depuis un slug beat ou un id d'offre.
 * @param input Criteres publics fournis par le client.
 * @returns Offre active d'un beat publie, ou null.
 */
export async function findPurchasableOffering(input: CreateDirectPurchaseOrderInput) {
  return getPrisma().beatLicenseOffering.findFirst({
    where: {
      ...(input.licenseOfferingId ? { id: input.licenseOfferingId } : {}),
      ...(input.beatSlug ? { beat: { slug: input.beatSlug } } : {}),
      isActive: true,
      stripePriceId: {
        not: null,
      },
      stripePriceActive: true,
      beat: {
        ...(input.beatSlug ? { slug: input.beatSlug } : {}),
        status: "PUBLISHED",
        visibility: "PUBLIC",
        moderationStatus: "CLEAN",
        stripeProductId: {
          not: null,
        },
        stripeSyncStatus: "SYNCED",
      },
      licenseTemplate: {
        isActive: true,
      },
      ...(input.licenseOfferingId ? {} : { isDefault: true }),
    },
    include: {
      beat: {
        select: {
          id: true,
          slug: true,
          title: true,
          ownerId: true,
        },
      },
      licenseTemplate: true,
    },
    orderBy: [{ isDefault: "desc" }, { priceAmount: "asc" }],
  });
}

export async function findPurchasableOfferingById(licenseOfferingId: string) {
  return findPurchasableOffering({ licenseOfferingId });
}

export async function findPurchasableOfferingsByIds(licenseOfferingIds: string[]) {
  const uniqueIds = Array.from(new Set(licenseOfferingIds));
  const rows = await getPrisma().beatLicenseOffering.findMany({
    where: {
      id: {
        in: uniqueIds,
      },
      isActive: true,
      stripePriceId: {
        not: null,
      },
      stripePriceActive: true,
      beat: {
        status: "PUBLISHED",
        visibility: "PUBLIC",
        moderationStatus: "CLEAN",
        stripeProductId: {
          not: null,
        },
        stripeSyncStatus: "SYNCED",
      },
      licenseTemplate: {
        isActive: true,
      },
    },
    include: {
      beat: {
        select: {
          id: true,
          slug: true,
          title: true,
          ownerId: true,
        },
      },
      licenseTemplate: true,
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));

  return uniqueIds.flatMap((id) => {
    const row = byId.get(id);

    return row ? [row] : [];
  });
}

/**
 * Verifie si l'acheteur possede deja une licence active pour cette offre.
 * @param args.buyerId Identifiant utilisateur interne de l'acheteur.
 * @param args.beatLicenseOfferingId Identifiant d'offre de licence.
 */
export async function findActiveEntitlementForOffering(args: {
  buyerId: string;
  beatLicenseOfferingId: string;
}) {
  return getPrisma().purchaseEntitlement.findFirst({
    where: {
      buyerId: args.buyerId,
      beatLicenseOfferingId: args.beatLicenseOfferingId,
      status: "ACTIVE",
      order: {
        status: "PAID",
      },
    },
    select: {
      id: true,
    },
  });
}

/**
 * Cree une commande en attente pour une offre de licence.
 * @param args.buyerId Identifiant utilisateur interne acheteur.
 * @param args.offering Offre active selectionnee.
 * @returns Commande avec lignes, paiements et entitlements charges.
 */
export async function createOrderForOffering(args: {
  buyerId: string;
  offering: NonNullable<Awaited<ReturnType<typeof findPurchasableOffering>>>;
}) {
  const priceAmount = decimalToNumber(args.offering.priceAmount) ?? 0;
  const commissionRateBp = await findSellerCommissionRateBp(args.offering.sellerId);
  const commissionAmount = commissionFromBp(priceAmount, commissionRateBp);
  const rightsSnapshot = buildRightsSnapshot(args.offering);

  return getPrisma().order.create({
    data: {
      buyerId: args.buyerId,
      status: "PENDING_PAYMENT",
      currency: args.offering.currency,
      subtotalAmount: priceAmount,
      commissionAmount,
      taxAmount: 0,
      totalAmount: priceAmount,
      items: {
        create: {
          type: "BEAT_LICENSE",
          beatId: args.offering.beat.id,
          beatLicenseOfferingId: args.offering.id,
          sellerId: args.offering.sellerId,
          titleSnapshot: args.offering.beat.title,
          licenseNameSnapshot: args.offering.title ?? args.offering.licenseTemplate.name,
          unitAmount: priceAmount,
          quantity: 1,
          lineTotalAmount: priceAmount,
          stripePriceIdSnapshot: args.offering.stripePriceId,
          commissionRateBpSnapshot: commissionRateBp,
          rightsSnapshotJson: rightsSnapshot,
        },
      },
    },
    include: orderInclude,
  });
}

export async function createOrderForCart(args: {
  buyerId: string;
  items: Array<{
    offering: NonNullable<Awaited<ReturnType<typeof findPurchasableOffering>>>;
    quantity: number;
  }>;
  promotion?: Awaited<ReturnType<typeof findApplicablePromotion>> | null;
}) {
  if (args.items.length === 0) {
    throw new Error("cart_empty");
  }

  const currency = args.items[0]?.offering.currency ?? "EUR";

  if (args.items.some((item) => item.offering.currency !== currency)) {
    throw new Error("mixed_currency_cart");
  }

  const subtotalAmount = roundMoney(
    args.items.reduce((sum, item) => {
      const priceAmount = decimalToNumber(item.offering.priceAmount) ?? 0;

      return sum + priceAmount * item.quantity;
    }, 0),
  );
  const promotion = args.promotion;
  const discountAmount = promotion
    ? discountFromPromotion({
        amount: subtotalAmount,
        discountType: promotion.discountType,
        discountValue: decimalToNumber(promotion.discountValue) ?? 0,
      })
    : 0;
  const totalAmount = roundMoney(subtotalAmount - discountAmount);

  if (totalAmount <= 0) {
    throw new Error("invalid_discount_total");
  }

  const commissionRateBySellerId = new Map<string, number>();

  for (const item of args.items) {
    if (!commissionRateBySellerId.has(item.offering.sellerId)) {
      commissionRateBySellerId.set(
        item.offering.sellerId,
        await findSellerCommissionRateBp(item.offering.sellerId),
      );
    }
  }

  const orderItems = args.items.map((item) => {
    const unitAmount = decimalToNumber(item.offering.priceAmount) ?? 0;
    const lineSubtotal = roundMoney(unitAmount * item.quantity);
    const lineDiscount = subtotalAmount > 0
      ? roundMoney(discountAmount * (lineSubtotal / subtotalAmount))
      : 0;
    const lineTotalAmount = roundMoney(lineSubtotal - lineDiscount);
    const commissionRateBp = commissionRateBySellerId.get(item.offering.sellerId) ??
      DEFAULT_PLATFORM_COMMISSION_RATE_BP;

    return {
      type: "BEAT_LICENSE" as const,
      beatId: item.offering.beat.id,
      beatLicenseOfferingId: item.offering.id,
      sellerId: item.offering.sellerId,
      titleSnapshot: item.offering.beat.title,
      licenseNameSnapshot: item.offering.title ?? item.offering.licenseTemplate.name,
      unitAmount,
      quantity: item.quantity,
      lineTotalAmount,
      discountAmount: lineDiscount,
      stripePriceIdSnapshot: lineDiscount > 0 ? null : item.offering.stripePriceId,
      commissionRateBpSnapshot: commissionRateBp,
      rightsSnapshotJson: buildRightsSnapshot(item.offering),
      promotionSnapshotJson: promotion
        ? {
            id: promotion.id,
            type: promotion.type,
            code: promotion.code,
            title: promotion.title,
            discountType: promotion.discountType,
            discountValue: decimalToNumber(promotion.discountValue) ?? 0,
          }
        : undefined,
    };
  });
  const commissionAmount = roundMoney(
    orderItems.reduce(
      (sum, item) => sum + commissionFromBp(item.lineTotalAmount, item.commissionRateBpSnapshot),
      0,
    ),
  );

  return getPrisma().order.create({
    data: {
      buyerId: args.buyerId,
      status: "PENDING_PAYMENT",
      currency,
      subtotalAmount,
      discountAmount,
      commissionAmount,
      taxAmount: 0,
      totalAmount,
      promotionId: promotion?.id,
      items: {
        create: orderItems,
      },
    },
    include: orderInclude,
  });
}

export async function createOrderForExclusiveOffer(args: {
  buyerId: string;
  offer: NonNullable<Awaited<ReturnType<typeof findAcceptedExclusiveOfferForBuyer>>>;
}) {
  const amount = decimalToNumber(args.offer.acceptedAmount) ??
    decimalToNumber(args.offer.counterAmount) ??
    decimalToNumber(args.offer.proposedAmount) ??
    0;
  const commissionRateBp = await findSellerCommissionRateBp(args.offer.sellerId);
  const commissionAmount = commissionFromBp(amount, commissionRateBp);
  const rightsSnapshot = buildRightsSnapshot(args.offer.beatLicenseOffering);

  return getPrisma().order.create({
    data: {
      buyerId: args.buyerId,
      status: "PENDING_PAYMENT",
      currency: args.offer.currency,
      subtotalAmount: amount,
      discountAmount: 0,
      commissionAmount,
      taxAmount: 0,
      totalAmount: amount,
      negotiatedOfferId: args.offer.id,
      items: {
        create: {
          type: "BEAT_LICENSE",
          beatId: args.offer.beat.id,
          beatLicenseOfferingId: args.offer.beatLicenseOffering.id,
          sellerId: args.offer.sellerId,
          titleSnapshot: args.offer.beat.title,
          licenseNameSnapshot:
            args.offer.beatLicenseOffering.title ??
            args.offer.beatLicenseOffering.licenseTemplate.name,
          unitAmount: amount,
          quantity: 1,
          lineTotalAmount: amount,
          stripePriceIdSnapshot: null,
          commissionRateBpSnapshot: commissionRateBp,
          rightsSnapshotJson: {
            ...rightsSnapshot,
            negotiatedExclusiveOfferId: args.offer.id,
          },
        },
      },
    },
    include: orderInclude,
  });
}

/**
 * Retourne le taux de commission vendeur courant, reduit si abonnement actif.
 */
export async function findSellerCommissionRateBp(sellerId: string, now = new Date()) {
  const subscription = await getPrisma().userSubscription.findFirst({
    where: {
      userId: sellerId,
      status: {
        in: ["ACTIVE", "TRIALING"],
      },
      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
      plan: {
        isActive: true,
      },
    },
    select: {
      plan: {
        select: {
          reducedCommissionRateBp: true,
        },
      },
    },
    orderBy: {
      currentPeriodEnd: "desc",
    },
  });

  return subscription?.plan.reducedCommissionRateBp ?? DEFAULT_PLATFORM_COMMISSION_RATE_BP;
}

/**
 * Charge une commande appartenant a un acheteur.
 * @param orderId Identifiant commande.
 * @param buyerId Identifiant utilisateur interne acheteur.
 */
export async function findBuyerOrder(orderId: string, buyerId: string) {
  return getPrisma().order.findFirst({
    where: {
      id: orderId,
      buyerId,
    },
    include: orderInclude,
  });
}

/**
 * Cree un paiement Stripe en attente pour une commande.
 * @param args Identifiants commande/acheteur, montant et devise.
 */
export async function createPendingStripePayment(args: {
  orderId: string;
  buyerId: string;
  amount: number;
  currency: string;
}) {
  return getPrisma().payment.create({
    data: {
      orderId: args.orderId,
      buyerId: args.buyerId,
      provider: "STRIPE",
      status: "PENDING",
      amount: args.amount,
      currency: args.currency,
    },
  });
}

/**
 * Recupere la derniere session Stripe ouverte/en attente reutilisable.
 * @param args Identifiants commande et acheteur.
 */
export async function findLatestPendingStripePayment(args: {
  orderId: string;
  buyerId: string;
}) {
  return getPrisma().payment.findFirst({
    where: {
      orderId: args.orderId,
      buyerId: args.buyerId,
      provider: "STRIPE",
      status: "PENDING",
      providerSessionId: {
        not: null,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

/**
 * Attache les identifiants Stripe et le payload fournisseur au paiement local.
 * @param args Identifiant paiement, session Stripe, payment intent et payload JSON.
 */
export async function attachStripeSessionToPayment(args: {
  paymentId: string;
  providerSessionId: string;
  providerPaymentIntentId?: string | null;
  payload: Prisma.InputJsonValue;
}) {
  return getPrisma().payment.update({
    where: {
      id: args.paymentId,
    },
    data: {
      providerSessionId: args.providerSessionId,
      providerPaymentIntentId: args.providerPaymentIntentId,
      providerPayloadJson: args.payload,
    },
  });
}

/**
 * Recherche un paiement Stripe confirmable pour une commande et un acheteur.
 * @param args Identifiants commande/acheteur et session optionnelle.
 */
export async function findStripePaymentForConfirmation(args: {
  orderId: string;
  buyerId: string;
  sessionId?: string;
}) {
  return getPrisma().payment.findFirst({
    where: {
      orderId: args.orderId,
      buyerId: args.buyerId,
      provider: "STRIPE",
      ...(args.sessionId ? { providerSessionId: args.sessionId } : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      order: {
        include: {
          items: true,
        },
      },
    },
  });
}

/**
 * Marque une commande comme payee depuis Stripe et cree les droits de telechargement.
 * @param args Commande, paiement, montant fiscal/total et payload Stripe verifie.
 * @returns Commande payee avec donnees associees.
 */
export async function markOrderPaidFromStripe(args: {
  orderId: string;
  paymentId: string;
  providerPaymentIntentId?: string | null;
  taxAmount: number;
  totalAmount: number;
  payload: Prisma.InputJsonValue;
}) {
  const prisma = getPrisma();
  const paidAt = new Date();

  const order = await prisma.$transaction(async (tx) => {
    const existingOrder = await tx.order.findUniqueOrThrow({
      where: { id: args.orderId },
      include: { items: true },
    });

    if (existingOrder.status === "PAID") {
      return tx.order.findUniqueOrThrow({
        where: { id: args.orderId },
        include: orderInclude,
      });
    }

    const updatedOrder = await tx.order.updateMany({
      where: {
        id: args.orderId,
        status: "PENDING_PAYMENT",
      },
      data: {
        status: "PAID",
        taxAmount: args.taxAmount,
        totalAmount: args.totalAmount,
        paidAt,
      },
    });

    if (updatedOrder.count === 0) {
      return tx.order.findUniqueOrThrow({
        where: { id: args.orderId },
        include: orderInclude,
      });
    }

    await tx.payment.update({
      where: { id: args.paymentId },
      data: {
        status: "SUCCEEDED",
        amount: args.totalAmount,
        providerPaymentIntentId: args.providerPaymentIntentId,
        providerPayloadJson: args.payload,
        paidAt,
      },
    });

    for (const item of existingOrder.items) {
      await tx.purchaseEntitlement.upsert({
        where: {
          orderItemId: item.id,
        },
        update: {
          status: "ACTIVE",
          accessGrantedAt: paidAt,
          revokedAt: null,
        },
        create: {
          orderId: existingOrder.id,
          orderItemId: item.id,
          buyerId: existingOrder.buyerId,
          sellerId: item.sellerId,
          beatId: item.beatId,
          beatLicenseOfferingId: item.beatLicenseOfferingId,
          status: "ACTIVE",
          downloadLimit: DEFAULT_DOWNLOAD_LIMIT,
          accessGrantedAt: paidAt,
          rightsSnapshotJson: item.rightsSnapshotJson ?? {},
        },
      });

      if (item.sellerId) {
        const lineTotal = decimalToNumber(item.lineTotalAmount) ?? 0;
        const commissionRateBp = item.commissionRateBpSnapshot;
        const commission = commissionFromBp(lineTotal, commissionRateBp);
        const sellerEarning = roundMoney(lineTotal - commission);

        await tx.payoutLedgerEntry.createMany({
          data: [
            {
              orderId: existingOrder.id,
              orderItemId: item.id,
              sellerId: item.sellerId,
              paymentId: args.paymentId,
              type: "GROSS_SALE",
              amount: lineTotal,
              currency: existingOrder.currency,
              description: "Gross beat license sale",
            },
            {
              orderId: existingOrder.id,
              orderItemId: item.id,
              sellerId: item.sellerId,
              paymentId: args.paymentId,
              type: "PLATFORM_COMMISSION",
              amount: -commission,
              currency: existingOrder.currency,
              description: commissionDescription(commissionRateBp),
            },
            {
              orderId: existingOrder.id,
              orderItemId: item.id,
              sellerId: item.sellerId,
              paymentId: args.paymentId,
              type: "SELLER_EARNING",
              amount: sellerEarning,
              currency: existingOrder.currency,
              description: "Seller earning after platform commission",
            },
          ],
          // Defense in depth (audit C1): l'idempotence webhook est en amont,
          // mais la contrainte UNIQUE (orderItemId, paymentId, type) + ce flag
          // garantissent qu'un replay ne crée jamais des lignes ledger doublees.
          skipDuplicates: true,
        });
      }
    }

    return tx.order.findUniqueOrThrow({
      where: { id: args.orderId },
      include: orderInclude,
    });
  });

  const sellerIds = Array.from(
    new Set(order.items.map((item) => item.seller?.id).filter((id): id is string => Boolean(id))),
  );

  await Promise.all(
    sellerIds.map(async (sellerId) => {
      const saleCount = await prisma.orderItem.count({
        where: {
          sellerId,
          order: {
            status: "PAID",
          },
        },
      });

      await prisma.userProfile.update({
        where: { userId: sellerId },
        data: { saleCount },
      });
    }),
  );

  return order;
}

/**
 * Marque un paiement Stripe en echec ou annule depuis un evenement webhook.
 * @param args Session Stripe, statut final, message et payload fournisseur.
 */
export async function markStripePaymentFailedBySession(args: {
  providerSessionId: string;
  status: "FAILED" | "CANCELED";
  failureMessage: string;
  payload: Prisma.InputJsonValue;
}) {
  return getPrisma().payment.updateMany({
    where: {
      providerSessionId: args.providerSessionId,
      provider: "STRIPE",
      status: {
        in: ["PENDING", "REQUIRES_ACTION"],
      },
    },
    data: {
      status: args.status,
      failureMessage: args.failureMessage,
      providerPayloadJson: args.payload,
    },
  });
}

type WebhookProvider = "STRIPE" | "PAYPAL" | "MANUAL";

/**
 * Enregistre la reception d'un evenement webhook pour idempotence (audit C1).
 * Tente d'inserer la ligne (provider, eventId) dans WebhookEventLog : la
 * contrainte UNIQUE garantit qu'un replay (retry Stripe, doublon reseau) sera
 * detecte ici et court-circuite avant tout effet de bord.
 *
 * @returns alreadyProcessed=true si l'evenement a deja ete vu.
 */
export async function recordWebhookEventStart(args: {
  provider: WebhookProvider;
  eventId: string;
  eventType: string;
}): Promise<{ alreadyProcessed: boolean }> {
  try {
    await getPrisma().webhookEventLog.create({
      data: {
        provider: args.provider,
        eventId: args.eventId,
        eventType: args.eventType,
        status: "PROCESSING",
      },
    });
    return { alreadyProcessed: false };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { alreadyProcessed: true };
    }
    throw error;
  }
}

/**
 * Marque un evenement webhook comme traite avec succes.
 */
export async function markWebhookEventProcessed(args: {
  provider: WebhookProvider;
  eventId: string;
}) {
  return getPrisma().webhookEventLog.update({
    where: {
      provider_eventId: { provider: args.provider, eventId: args.eventId },
    },
    data: {
      status: "PROCESSED",
      processedAt: new Date(),
      errorMessage: null,
    },
  });
}

/**
 * Marque un evenement webhook comme ayant echoue. La ligne reste en base avec
 * son `eventId` UNIQUE pour empecher un replay automatique tant que l'erreur
 * n'a pas ete diagnostiquee (les operations doivent rejouer manuellement).
 */
export async function markWebhookEventFailed(args: {
  provider: WebhookProvider;
  eventId: string;
  errorMessage: string;
}) {
  return getPrisma().webhookEventLog.update({
    where: {
      provider_eventId: { provider: args.provider, eventId: args.eventId },
    },
    data: {
      status: "FAILED",
      processedAt: new Date(),
      errorMessage: args.errorMessage.slice(0, 2000),
    },
  });
}

/**
 * Liste les commandes d'un acheteur.
 * @param buyerId Identifiant utilisateur interne acheteur.
 */
export async function listBuyerOrders(buyerId: string) {
  return getPrisma().order.findMany({
    where: {
      buyerId,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: orderInclude,
  });
}

/**
 * Liste les lignes de commandes visibles par un vendeur.
 * @param sellerId Identifiant utilisateur interne vendeur.
 */
export async function listSellerOrderItems(sellerId: string) {
  return getPrisma().orderItem.findMany({
    where: {
      sellerId,
      order: {
        status: {
          in: ["PENDING_PAYMENT", "PAID", "PARTIALLY_REFUNDED", "REFUNDED"],
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      order: {
        include: {
          payments: {
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      },
      beat: {
        select: {
          id: true,
          slug: true,
          title: true,
        },
      },
    },
  });
}

/**
 * Liste les instrumentales appartenant au vendeur pour son dashboard prive.
 * @param sellerId Identifiant utilisateur interne vendeur.
 */
export async function listSellerBeats(sellerId: string) {
  return getPrisma().beat.findMany({
    where: {
      ownerId: sellerId,
      status: {
        not: "DELETED",
      },
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      visibility: true,
      basePriceAmount: true,
      currency: true,
      publishedAt: true,
      updatedAt: true,
      stats: true,
    },
  });
}

export async function createExclusiveOffer(args: {
  buyerId: string;
  input: CreateExclusiveOfferInput;
}) {
  const offering = await findPurchasableOfferingById(args.input.beatLicenseOfferingId);

  if (!offering || offering.licenseTemplate.scope !== "EXCLUSIVE") {
    throw new Error("exclusive_license_not_found");
  }

  if (offering.sellerId === args.buyerId) {
    throw new Error("cannot_offer_own_beat");
  }

  const paidExclusive = await getPrisma().purchaseEntitlement.findFirst({
    where: {
      beatId: offering.beat.id,
      status: "ACTIVE",
      beatLicenseOffering: {
        licenseTemplate: {
          scope: "EXCLUSIVE",
        },
      },
      order: {
        status: "PAID",
      },
    },
    select: {
      id: true,
    },
  });

  if (paidExclusive) {
    throw new Error("exclusive_license_unavailable");
  }

  return getPrisma().exclusiveLicenseOffer.create({
    data: {
      beatId: offering.beat.id,
      beatLicenseOfferingId: offering.id,
      buyerId: args.buyerId,
      sellerId: offering.sellerId,
      proposedAmount: args.input.proposedAmount,
      currency: offering.currency,
      buyerMessage: args.input.buyerMessage,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    include: exclusiveOfferInclude,
  });
}

const exclusiveOfferInclude = {
  beat: {
    select: {
      id: true,
      slug: true,
      title: true,
    },
  },
  beatLicenseOffering: {
    include: {
      licenseTemplate: true,
    },
  },
  buyer: {
    select: {
      id: true,
      profile: {
        select: {
          displayName: true,
        },
      },
    },
  },
} as const;

export async function listSellerExclusiveOffers(sellerId: string) {
  return getPrisma().exclusiveLicenseOffer.findMany({
    where: {
      sellerId,
      status: {
        in: ["PENDING", "COUNTERED", "ACCEPTED"],
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
    include: exclusiveOfferInclude,
  });
}

export async function findAcceptedExclusiveOfferForBuyer(args: {
  exclusiveOfferId: string;
  buyerId: string;
}) {
  return getPrisma().exclusiveLicenseOffer.findFirst({
    where: {
      id: args.exclusiveOfferId,
      buyerId: args.buyerId,
      status: "ACCEPTED",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      order: null,
    },
    include: {
      ...exclusiveOfferInclude,
      beatLicenseOffering: {
        include: {
          licenseTemplate: true,
        },
      },
    },
  });
}

export async function updateSellerExclusiveOffer(args: {
  sellerId: string;
  offerId: string;
  input: UpdateExclusiveOfferInput;
}) {
  const existing = await getPrisma().exclusiveLicenseOffer.findFirst({
    where: {
      id: args.offerId,
      sellerId: args.sellerId,
      status: {
        in: ["PENDING", "COUNTERED"],
      },
    },
    select: {
      id: true,
      proposedAmount: true,
    },
  });

  if (!existing) {
    throw new Error("exclusive_offer_not_found");
  }

  const data =
    args.input.action === "accept"
      ? {
          status: "ACCEPTED" as const,
          acceptedAmount: existing.proposedAmount,
          acceptedAt: new Date(),
          sellerMessage: args.input.sellerMessage,
        }
      : args.input.action === "reject"
        ? {
            status: "REJECTED" as const,
            rejectedAt: new Date(),
            sellerMessage: args.input.sellerMessage,
          }
        : {
            status: "COUNTERED" as const,
            counterAmount: args.input.counterAmount,
            acceptedAmount: args.input.counterAmount,
            sellerMessage: args.input.sellerMessage,
          };

  return getPrisma().exclusiveLicenseOffer.update({
    where: {
      id: existing.id,
    },
    data,
    include: exclusiveOfferInclude,
  });
}

export async function markExclusiveOfferPaid(orderId: string) {
  const order = await getPrisma().order.findUnique({
    where: {
      id: orderId,
    },
    select: {
      negotiatedOfferId: true,
    },
  });

  if (!order?.negotiatedOfferId) {
    return;
  }

  await getPrisma().exclusiveLicenseOffer.update({
    where: {
      id: order.negotiatedOfferId,
    },
    data: {
      status: "PAID",
      paidAt: new Date(),
    },
  });
}

export async function markPromotionUsed(orderId: string) {
  const order = await getPrisma().order.findUnique({
    where: {
      id: orderId,
    },
    select: {
      promotionId: true,
    },
  });

  if (!order?.promotionId) {
    return;
  }

  await getPrisma().promotion.update({
    where: {
      id: order.promotionId,
    },
    data: {
      usageCount: {
        increment: 1,
      },
    },
  });
}

export async function listSellerPromotions(sellerId: string) {
  return getPrisma().promotion.findMany({
    where: {
      sellerId,
    },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    take: 20,
  });
}

export async function findApplicablePromotion(args: {
  sellerIds: string[];
  itemCount: number;
  currency: string;
  promotionCode?: string;
  beatIds?: string[];
  licenseOfferingIds?: string[];
}) {
  const now = new Date();
  const promotions = await getPrisma().promotion.findMany({
    where: {
      sellerId: {
        in: args.sellerIds,
      },
      isActive: true,
      minItems: {
        lte: args.itemCount,
      },
      OR: args.promotionCode
        ? [{ code: args.promotionCode }]
        : [{ type: "BUNDLE" }],
      AND: [
        {
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        },
        {
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
        {
          OR: [{ currency: null }, { currency: args.currency }],
        },
      ],
    },
    orderBy: [{ type: "asc" }, { discountValue: "desc" }],
    take: 20,
  });

  return promotions.find((promotion) => {
    if (promotion.usageLimit !== null && promotion.usageCount >= promotion.usageLimit) {
      return false;
    }

    if (!promotion.scopeJson || typeof promotion.scopeJson !== "object" || Array.isArray(promotion.scopeJson)) {
      return true;
    }

    const scope = promotion.scopeJson as {
      beatIds?: unknown;
      licenseOfferingIds?: unknown;
    };
    const beatIds = Array.isArray(scope.beatIds)
      ? scope.beatIds.filter((id): id is string => typeof id === "string")
      : [];
    const licenseOfferingIds = Array.isArray(scope.licenseOfferingIds)
      ? scope.licenseOfferingIds.filter((id): id is string => typeof id === "string")
      : [];

    return (
      (beatIds.length === 0 || args.beatIds?.some((id) => beatIds.includes(id))) &&
      (licenseOfferingIds.length === 0 ||
        args.licenseOfferingIds?.some((id) => licenseOfferingIds.includes(id)))
    );
  }) ?? null;
}

export async function createSellerPromotion(args: {
  sellerId: string;
  input: CreatePromotionInput;
}) {
  return getPrisma().promotion.create({
    data: {
      sellerId: args.sellerId,
      type: args.input.type,
      discountType: args.input.discountType,
      title: args.input.title,
      code: args.input.type === "COUPON" ? args.input.code : null,
      discountValue: args.input.discountValue,
      currency: args.input.currency,
      minItems: args.input.type === "BUNDLE" ? args.input.minItems ?? 2 : args.input.minItems ?? 1,
      usageLimit: args.input.usageLimit,
      startsAt: args.input.startsAt ? new Date(args.input.startsAt) : undefined,
      endsAt: args.input.endsAt ? new Date(args.input.endsAt) : undefined,
      scopeJson: args.input.scope,
    },
  });
}

export async function updateSellerPromotion(args: {
  sellerId: string;
  promotionId: string;
  input: UpdatePromotionInput;
}) {
  const existing = await getPrisma().promotion.findFirst({
    where: {
      id: args.promotionId,
      sellerId: args.sellerId,
    },
    select: {
      id: true,
    },
  });

  if (!existing) {
    throw new Error("promotion_not_found");
  }

  return getPrisma().promotion.update({
    where: {
      id: existing.id,
    },
    data: {
      type: args.input.type,
      discountType: args.input.discountType,
      title: args.input.title,
      code: args.input.code,
      discountValue: args.input.discountValue,
      currency: args.input.currency,
      minItems: args.input.minItems,
      usageLimit: args.input.usageLimit,
      startsAt: args.input.startsAt ? new Date(args.input.startsAt) : undefined,
      endsAt: args.input.endsAt ? new Date(args.input.endsAt) : undefined,
      scopeJson: args.input.scope,
      isActive: args.input.isActive,
    },
  });
}

/**
 * Compte les ventes payees par beat pour un vendeur.
 * @param sellerId Identifiant utilisateur interne vendeur.
 */
export async function countPaidSellerOrderItemsByBeat(sellerId: string) {
  return getPrisma().orderItem.groupBy({
    by: ["beatId"],
    where: {
      sellerId,
      beatId: {
        not: null,
      },
      order: {
        status: "PAID",
      },
    },
    _count: {
      _all: true,
    },
  });
}

/**
 * Liste les entrees de ledger utiles au calcul de revenus vendeur.
 * @param sellerId Identifiant utilisateur interne vendeur.
 */
export async function listSellerRevenueLedgerEntries(sellerId: string) {
  return getPrisma().payoutLedgerEntry.findMany({
    where: {
      sellerId,
      type: {
        in: ["GROSS_SALE", "PLATFORM_COMMISSION", "SELLER_EARNING"],
      },
    },
    select: {
      type: true,
      amount: true,
      currency: true,
    },
  });
}

/**
 * Charge la derniere verification KYC d'un utilisateur pour l'eligibilite payout.
 * @param userId Identifiant utilisateur interne.
 */
export async function findLatestKycVerificationForUser(userId: string) {
  return getPrisma().kycVerification.findFirst({
    where: {
      userId,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      status: true,
      reviewedAt: true,
      expiresAt: true,
    },
  });
}

/**
 * Charge un entitlement actif appartenant a un acheteur avec ses assets telechargeables.
 * @param args.entitlementId Identifiant du droit d'achat.
 * @param args.buyerId Identifiant utilisateur interne acheteur.
 */
export async function findDownloadEntitlement(args: {
  entitlementId: string;
  buyerId: string;
}) {
  return getPrisma().purchaseEntitlement.findFirst({
    where: {
      id: args.entitlementId,
      buyerId: args.buyerId,
      status: "ACTIVE",
      order: {
        status: "PAID",
      },
    },
    include: {
      orderItem: true,
      beat: {
        select: {
          id: true,
          slug: true,
          title: true,
          assets: {
            where: {
              role: {
                in: ["AUDIO_LICENSED_ARCHIVE", "AUDIO_SOURCE"],
              },
              asset: {
                processingStatus: "READY",
              },
            },
            orderBy: {
              sortOrder: "asc",
            },
            include: {
              asset: true,
            },
          },
        },
      },
    },
  });
}

/**
 * Incremente le compteur de telechargements d'un entitlement.
 * @param entitlementId Identifiant du droit d'achat.
 */
export async function incrementEntitlementDownloadCount(entitlementId: string) {
  return getPrisma().purchaseEntitlement.update({
    where: {
      id: entitlementId,
    },
    data: {
      downloadCount: {
        increment: 1,
      },
    },
  });
}
