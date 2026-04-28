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

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function decimalToNumber(value: Prisma.Decimal | number | null) {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value.toString());
}

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

export async function findPurchasableOffering(input: CreateDirectPurchaseOrderInput) {
  return getPrisma().beatLicenseOffering.findFirst({
    where: {
      ...(input.licenseOfferingId ? { id: input.licenseOfferingId } : {}),
      ...(input.beatSlug ? { beat: { slug: input.beatSlug } } : {}),
      isActive: true,
      beat: {
        ...(input.beatSlug ? { slug: input.beatSlug } : {}),
        status: "PUBLISHED",
        visibility: "PUBLIC",
        moderationStatus: "CLEAN",
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
          rightsSnapshotJson: rightsSnapshot,
        },
      },
    },
    include: orderInclude,
  });
}

export async function findBuyerOrder(orderId: string, buyerId: string) {
  return getPrisma().order.findFirst({
    where: {
      id: orderId,
      buyerId,
    },
    include: orderInclude,
  });
}

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
        const commission = roundMoney(lineTotal * PLATFORM_COMMISSION_RATE);
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
