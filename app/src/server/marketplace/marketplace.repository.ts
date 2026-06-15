import "server-only";

import { getPrisma } from "@/lib/prisma";

import { Prisma } from "../../../generated/prisma/client";
import { DEFAULT_DOWNLOAD_LIMIT, PLATFORM_COMMISSION_RATE } from "./marketplace.constants";
import type { CreateDirectPurchaseOrderInput } from "./marketplace.types";

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

/**
 * Convertit un Decimal Prisma en number nullable.
 * @param value Montant Decimal, number ou null.
 */
function decimalToNumber(value: Prisma.Decimal | number | null) {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value.toString());
}

/**
 * Capture les droits de licence au moment de l'achat pour figer le contrat.
 * @param offering Offre purchasable chargee avec son template.
 * @returns Snapshot JSON des droits et conditions.
 */
function buildRightsSnapshot(offering: Awaited<ReturnType<typeof findPurchasableOffering>>) {
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
  const commissionAmount = roundMoney(priceAmount * PLATFORM_COMMISSION_RATE);
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
          rightsSnapshotJson: rightsSnapshot,
        },
      },
    },
    include: orderInclude,
  });
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
        const commission = roundMoney(lineTotal * PLATFORM_COMMISSION_RATE); //! varier la commission en fonction de l'abonnement de l'utilisateur
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
              description: "Platform commission 30%",
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
