import "server-only";

import { getPrisma } from "@/lib/prisma";

import type { ConversationType } from "../../../generated/prisma/enums";
import type { CreateChatOfferInput, MessagePageInput, SendMessageInput } from "./chat.types";

const chatUserSelect = {
  id: true,
  profile: {
    select: {
      displayName: true,
      slug: true,
      avatarAsset: {
        select: {
          bucket: true,
          objectKey: true,
          isPublic: true,
        },
      },
    },
  },
} as const;

export const conversationInclude = {
  participants: {
    orderBy: {
      joinedAt: "asc" as const,
    },
    include: {
      user: {
        select: chatUserSelect,
      },
    },
  },
  messages: {
    orderBy: {
      createdAt: "desc" as const,
    },
    take: 1,
    include: {
      sender: {
        select: chatUserSelect,
      },
    },
  },
} as const;

export const messageInclude = {
  sender: {
    select: chatUserSelect,
  },
} as const;

/**
 * Charge un utilisateur local par slug public visible.
 * @param slug Slug de profil cible.
 */
export async function findChatTargetByProfileSlug(slug: string) {
  return getPrisma().userProfile.findFirst({
    where: {
      slug,
      isPublic: true,
      user: {
        status: "ACTIVE",
      },
    },
    select: {
      userId: true,
      displayName: true,
      slug: true,
    },
  });
}

/**
 * Charge un beat public publiable comme contexte de discussion.
 * @param slug Slug public du beat.
 */
export async function findChatTargetByBeatSlug(slug: string) {
  return getPrisma().beat.findFirst({
    where: {
      slug,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      moderationStatus: "CLEAN",
      owner: {
        status: "ACTIVE",
      },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      ownerId: true,
    },
  });
}

export async function findChatBeatSeller(beatId: string) {
  return getPrisma().beat.findFirst({
    where: {
      id: beatId,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      moderationStatus: "CLEAN",
      owner: {
        status: "ACTIVE",
      },
    },
    select: {
      id: true,
      ownerId: true,
    },
  });
}

/**
 * Retourne une conversation V1 existante entre deux utilisateurs.
 * @param args Criteres de conversation.
 */
export async function findExistingConversation(args: {
  userId: string;
  targetUserId: string;
  type: ConversationType;
  beatId?: string | null;
}) {
  return getPrisma().conversation.findFirst({
    where: {
      type: args.type,
      beatId: args.beatId ?? null,
      orderId: null,
      AND: [
        {
          participants: {
            some: {
              userId: args.userId,
            },
          },
        },
        {
          participants: {
            some: {
              userId: args.targetUserId,
            },
          },
        },
      ],
    },
    include: conversationInclude,
  });
}

/**
 * Cree une conversation avec deux participants.
 * @param args Donnees de creation.
 */
export async function createConversation(args: {
  userId: string;
  targetUserId: string;
  type: ConversationType;
  beatId?: string | null;
}) {
  return getPrisma().conversation.create({
    data: {
      type: args.type,
      createdById: args.userId,
      beatId: args.beatId ?? null,
      participants: {
        create: [
          {
            userId: args.userId,
            lastReadAt: new Date(),
          },
          {
            userId: args.targetUserId,
          },
        ],
      },
    },
    include: conversationInclude,
  });
}

/**
 * Liste les conversations auxquelles l'utilisateur participe.
 * @param userId Identifiant local utilisateur.
 */
export async function listUserConversations(userId: string) {
  return getPrisma().conversation.findMany({
    where: {
      participants: {
        some: {
          userId,
        },
      },
    },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    include: conversationInclude,
  });
}

/**
 * Charge une conversation si l'utilisateur courant en est participant.
 * @param args Identifiants conversation/utilisateur.
 */
export async function findParticipantConversation(args: {
  conversationId: string;
  userId: string;
}) {
  return getPrisma().conversation.findFirst({
    where: {
      id: args.conversationId,
      participants: {
        some: {
          userId: args.userId,
        },
      },
    },
    include: conversationInclude,
  });
}

/**
 * Liste les messages d'une conversation autorisee.
 * @param conversationId Identifiant conversation.
 * @param page Pagination validee.
 */
export async function listConversationMessages(
  conversationId: string,
  page: MessagePageInput,
) {
  return getPrisma().message.findMany({
    where: {
      conversationId,
      ...(page.before ? { createdAt: { lt: page.before } } : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
    take: page.limit,
    include: messageInclude,
  });
}

/**
 * Cree un message texte et met a jour la conversation atomiquement.
 * @param args Identifiants et body valide.
 */
export async function createTextMessage(args: {
  conversationId: string;
  senderId: string;
  input: SendMessageInput;
}) {
  return getPrisma().$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        conversationId: args.conversationId,
        senderId: args.senderId,
        type: "TEXT",
        body: args.input.body,
      },
      include: messageInclude,
    });

    await tx.conversation.update({
      where: {
        id: args.conversationId,
      },
      data: {
        lastMessageAt: message.createdAt,
      },
    });

    return message;
  });
}

export async function createExclusiveOfferMessage(args: {
  conversationId: string;
  senderId: string;
  buyerId: string;
  sellerId: string;
  beatId: string;
  input: CreateChatOfferInput;
  direction: "buyer_offer" | "seller_offer";
}) {
  const offering = await getPrisma().beatLicenseOffering.findFirst({
    where: {
      beatId: args.beatId,
      sellerId: args.sellerId,
      isActive: true,
      beat: {
        status: "PUBLISHED",
        visibility: "PUBLIC",
        moderationStatus: "CLEAN",
      },
      licenseTemplate: {
        scope: "EXCLUSIVE",
        isActive: true,
      },
    },
    include: {
      beat: {
        select: {
          id: true,
          slug: true,
          title: true,
        },
      },
      licenseTemplate: true,
    },
    orderBy: {
      priceAmount: "asc",
    },
  });

  if (!offering) {
    throw new Error("exclusive_license_not_found");
  }

  const status = args.direction === "seller_offer" ? "ACCEPTED" : "PENDING";

  return getPrisma().$transaction(async (tx) => {
    const offer = await tx.exclusiveLicenseOffer.create({
      data: {
        beatId: offering.beat.id,
        beatLicenseOfferingId: offering.id,
        buyerId: args.buyerId,
        sellerId: args.sellerId,
        status,
        proposedAmount: args.input.amount,
        acceptedAmount: args.direction === "seller_offer" ? args.input.amount : undefined,
        currency: offering.currency,
        buyerMessage: args.direction === "buyer_offer" ? args.input.message : undefined,
        sellerMessage: args.direction === "seller_offer" ? args.input.message : undefined,
        acceptedAt: args.direction === "seller_offer" ? new Date() : undefined,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    const body =
      args.direction === "seller_offer"
        ? `Offre exclusive approuvee pour ${offering.beat.title}: ${args.input.amount} ${offering.currency}.`
        : `Proposition d'offre exclusive pour ${offering.beat.title}: ${args.input.amount} ${offering.currency}.`;
    const message = await tx.message.create({
      data: {
        conversationId: args.conversationId,
        senderId: args.senderId,
        type: "TEXT",
        body: args.input.message ? `${body}\n${args.input.message}` : body,
        metadataJson: {
          kind: "exclusive_offer",
          offerId: offer.id,
          status,
          amount: args.input.amount,
          currency: offering.currency,
          beatTitle: offering.beat.title,
          beatSlug: offering.beat.slug,
          direction: args.direction,
        },
      },
      include: messageInclude,
    });

    await tx.conversation.update({
      where: {
        id: args.conversationId,
      },
      data: {
        lastMessageAt: message.createdAt,
      },
    });

    return message;
  });
}

/**
 * Marque une conversation comme lue pour un participant.
 * @param args Identifiants conversation/utilisateur.
 */
export async function markConversationRead(args: {
  conversationId: string;
  userId: string;
}) {
  return getPrisma().conversationParticipant.update({
    where: {
      conversationId_userId: {
        conversationId: args.conversationId,
        userId: args.userId,
      },
    },
    data: {
      lastReadAt: new Date(),
    },
  });
}

/**
 * Compte les messages non lus pour une participation.
 * @param args Identifiants et borne de lecture.
 */
export async function countUnreadMessages(args: {
  conversationId: string;
  userId: string;
  since: Date;
}) {
  return getPrisma().message.count({
    where: {
      conversationId: args.conversationId,
      createdAt: {
        gt: args.since,
      },
      senderId: {
        not: args.userId,
      },
    },
  });
}

/**
 * Charge les informations beat pour des conversations.
 * @param beatIds Identifiants beat uniques.
 */
export async function findChatBeatsByIds(beatIds: string[]) {
  if (beatIds.length === 0) {
    return [];
  }

  return getPrisma().beat.findMany({
    where: {
      id: {
        in: beatIds,
      },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      licenseOfferings: {
        where: {
          isActive: true,
          licenseTemplate: {
            scope: "EXCLUSIVE",
            isActive: true,
          },
        },
        orderBy: {
          priceAmount: "asc",
        },
        take: 1,
        select: {
          id: true,
          title: true,
          priceAmount: true,
          currency: true,
        },
      },
    },
  });
}
