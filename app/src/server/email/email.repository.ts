import "server-only";

import { getPrisma } from "@/lib/prisma";

import { Prisma } from "../../../generated/prisma/client";
import type { EmailEventStatus, EmailProvider, EmailTemplate } from "../../../generated/prisma/enums";

/**
 * Cree un evenement email avant tentative provider.
 * @param args Donnees journalisees.
 */
export async function createEmailEvent(args: {
  recipientUserId?: string | null;
  toEmail: string;
  fromEmail?: string | null;
  template: EmailTemplate;
  provider: EmailProvider;
  subject: string;
  dedupeKey?: string;
  metadataJson?: Prisma.InputJsonValue;
}) {
  return getPrisma().emailEvent.create({
    data: {
      recipientUserId: args.recipientUserId,
      toEmail: args.toEmail,
      fromEmail: args.fromEmail,
      template: args.template,
      provider: args.provider,
      subject: args.subject,
      dedupeKey: args.dedupeKey,
      metadataJson: args.metadataJson,
      status: "PENDING",
    },
  });
}

/**
 * Retourne un evenement deja envoye/skipped par cle de deduplication.
 * @param dedupeKey Cle fonctionnelle stable.
 */
export async function findEmailEventByDedupeKey(dedupeKey: string) {
  return getPrisma().emailEvent.findUnique({
    where: {
      dedupeKey,
    },
  });
}

/**
 * Met a jour le statut final d'un evenement email.
 * @param args Resultat provider ou erreur.
 */
export async function updateEmailEventStatus(args: {
  id: string;
  status: EmailEventStatus;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  sentAt?: Date | null;
}) {
  return getPrisma().emailEvent.update({
    where: {
      id: args.id,
    },
    data: {
      status: args.status,
      providerMessageId: args.providerMessageId,
      errorMessage: args.errorMessage,
      sentAt: args.sentAt,
    },
  });
}

/**
 * Charge le contexte complet d'une commande pour emails achat/vente.
 * @param orderId Identifiant commande.
 */
export async function findOrderEmailContext(orderId: string) {
  const order = await getPrisma().order.findUnique({
    where: {
      id: orderId,
    },
    select: {
      id: true,
      currency: true,
      totalAmount: true,
      buyer: {
        select: {
          id: true,
          email: true,
          profile: {
            select: {
              displayName: true,
            },
          },
        },
      },
      items: {
        orderBy: {
          createdAt: "asc",
        },
        select: {
          id: true,
          titleSnapshot: true,
          lineTotalAmount: true,
          seller: {
            select: {
              id: true,
              email: true,
              profile: {
                select: {
                  displayName: true,
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
      },
    },
  });

  if (!order) {
    return null;
  }

  return {
    id: order.id,
    currency: order.currency,
    totalAmount: Number(order.totalAmount.toString()),
    buyer: {
      id: order.buyer.id,
      email: order.buyer.email,
      displayName: order.buyer.profile?.displayName ?? null,
    },
    items: order.items.map((item) => ({
      id: item.id,
      title: item.titleSnapshot,
      lineTotalAmount: Number(item.lineTotalAmount.toString()),
      seller: item.seller
        ? {
            id: item.seller.id,
            email: item.seller.email,
            displayName: item.seller.profile?.displayName ?? null,
          }
        : null,
      beat: item.beat,
    })),
  };
}

/**
 * Charge un compte par id Clerk pour email acces vendeur.
 * @param clerkUserId Identifiant Clerk.
 */
export async function findEmailAccountByClerkUserId(clerkUserId: string) {
  return getPrisma().user.findUnique({
    where: {
      clerkUserId,
    },
    select: {
      id: true,
      email: true,
      profile: {
        select: {
          displayName: true,
        },
      },
    },
  });
}

/**
 * Liste les participants avec messages non lus depuis plus de 24h.
 * @param cutoff Date maximale du message non lu.
 */
export async function findChatUnreadReminderCandidates(cutoff: Date) {
  return getPrisma().conversationParticipant.findMany({
    where: {
      isMuted: false,
      user: {
        status: "ACTIVE",
      },
      conversation: {
        messages: {
          some: {
            createdAt: {
              lte: cutoff,
            },
          },
        },
      },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          profile: {
            select: {
              displayName: true,
            },
          },
        },
      },
      conversation: {
        include: {
          messages: {
            where: {
              createdAt: {
                lte: cutoff,
              },
            },
            orderBy: {
              createdAt: "desc",
            },
            take: 25,
            include: {
              sender: {
                select: {
                  id: true,
                  profile: {
                    select: {
                      displayName: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

/**
 * Charge le contexte d'un abonnement pour email transactionnel.
 * @param providerSubscriptionId Identifiant subscription Stripe.
 */
export async function findSubscriptionEmailContext(providerSubscriptionId: string) {
  const subscription = await getPrisma().userSubscription.findUnique({
    where: {
      providerSubscriptionId,
    },
    select: {
      id: true,
      providerSubscriptionId: true,
      status: true,
      currentPeriodEnd: true,
      user: {
        select: {
          id: true,
          email: true,
          profile: {
            select: {
              displayName: true,
            },
          },
        },
      },
      plan: {
        select: {
          name: true,
          reducedCommissionRateBp: true,
        },
      },
    },
  });

  if (!subscription) {
    return null;
  }

  return {
    id: subscription.id,
    providerSubscriptionId: subscription.providerSubscriptionId,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd,
    user: {
      id: subscription.user.id,
      email: subscription.user.email,
      displayName: subscription.user.profile?.displayName ?? null,
    },
    plan: subscription.plan,
  };
}
