import "server-only";

import { syncCurrentAccountFromClerk } from "@/server/account/account.sync";
import { getPublicAssetUrl } from "@/server/storage/s3";

import type { ConversationType } from "../../../generated/prisma/enums";
import {
  countUnreadMessages,
  createConversation,
  createTextMessage,
  findChatBeatsByIds,
  findChatTargetByBeatSlug,
  findChatTargetByProfileSlug,
  findExistingConversation,
  findParticipantConversation,
  listConversationMessages,
  listUserConversations,
  markConversationRead,
} from "./chat.repository";
import type {
  ChatBeatPayload,
  ChatUserPayload,
  ConversationSummary,
  CreateConversationInput,
  MessagePageInput,
  MessagePayload,
  SendMessageInput,
} from "./chat.types";

type Account = Awaited<ReturnType<typeof syncCurrentAccountFromClerk>>;
type ConversationRecord = Awaited<ReturnType<typeof listUserConversations>>[number];
type MessageRecord = Awaited<ReturnType<typeof listConversationMessages>>[number];

/**
 * Synchronise et valide le compte local correspondant a la session Clerk.
 * @param clerkUserId Identifiant Clerk attendu depuis auth().
 */
async function assertCurrentAccount(clerkUserId: string): Promise<Account> {
  const account = await syncCurrentAccountFromClerk();

  if (account.clerkUserId !== clerkUserId) {
    throw new Error("account_not_found");
  }

  return account;
}

/**
 * Convertit un utilisateur Prisma en payload chat public minimal.
 * @param user Utilisateur charge avec son profil.
 */
async function serializeUser(user: {
  id: string;
  profile: {
    displayName: string;
    slug: string;
    avatarAsset: {
      bucket: string;
      objectKey: string;
      isPublic: boolean;
    } | null;
  } | null;
}): Promise<ChatUserPayload> {
  const avatarUrl = user.profile?.avatarAsset
    ? await getPublicAssetUrl(user.profile.avatarAsset)
    : null;

  return {
    id: user.id,
    displayName: user.profile?.displayName ?? null,
    slug: user.profile?.slug ?? null,
    avatarUrl,
  };
}

/**
 * Convertit un message Prisma en payload API.
 * @param message Message charge avec sender.
 */
async function serializeMessage(message: MessageRecord): Promise<MessagePayload> {
  return {
    id: message.id,
    conversationId: message.conversationId,
    sender: message.sender ? await serializeUser(message.sender) : null,
    type: message.type,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
  };
}

/**
 * Retourne la borne de non-lu pour un participant.
 * @param conversation Conversation chargee avec participants.
 * @param userId Identifiant local utilisateur.
 */
function unreadSince(conversation: ConversationRecord, userId: string) {
  const participant = conversation.participants.find((item) => item.userId === userId);

  if (!participant) {
    throw new Error("conversation_forbidden");
  }

  return participant.lastReadAt ?? participant.joinedAt;
}

/**
 * Serialise les conversations avec contexte beat et compteur non-lu.
 * @param args Conversations et utilisateur courant.
 */
async function serializeConversations(args: {
  conversations: ConversationRecord[];
  userId: string;
}): Promise<ConversationSummary[]> {
  const beatIds = Array.from(
    new Set(
      args.conversations
        .map((conversation) => conversation.beatId)
        .filter((beatId): beatId is string => Boolean(beatId)),
    ),
  );
  const beats = await findChatBeatsByIds(beatIds);
  const beatById = new Map(beats.map((beat) => [beat.id, beat]));

  return Promise.all(
    args.conversations.map(async (conversation) => {
      const beat = conversation.beatId ? beatById.get(conversation.beatId) : null;
      const since = unreadSince(conversation, args.userId);
      const unreadCount = await countUnreadMessages({
        conversationId: conversation.id,
        userId: args.userId,
        since,
      });

      return {
        id: conversation.id,
        type: conversation.type,
        beat: beat
          ? {
              id: beat.id,
              slug: beat.slug,
              title: beat.title,
            }
          : (null satisfies ChatBeatPayload),
        participants: await Promise.all(
          conversation.participants.map((participant) => serializeUser(participant.user)),
        ),
        otherParticipants: await Promise.all(
          conversation.participants
            .filter((participant) => participant.userId !== args.userId)
            .map((participant) => serializeUser(participant.user)),
        ),
        lastMessage: conversation.messages[0]
          ? await serializeMessage(conversation.messages[0])
          : null,
        lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
        unreadCount,
        createdAt: conversation.createdAt.toISOString(),
      };
    }),
  );
}

/**
 * Liste les conversations de l'utilisateur courant.
 * @param clerkUserId Identifiant Clerk de session.
 */
export async function listCurrentUserConversations(clerkUserId: string) {
  const account = await assertCurrentAccount(clerkUserId);
  const conversations = await listUserConversations(account.id);

  return serializeConversations({
    conversations,
    userId: account.id,
  });
}

/**
 * Cree ou recupere une conversation V1 depuis profil ou beat.
 * @param clerkUserId Identifiant Clerk de session.
 * @param input Cible validee.
 */
export async function createOrGetCurrentUserConversation(
  clerkUserId: string,
  input: CreateConversationInput,
) {
  const account = await assertCurrentAccount(clerkUserId);
  let targetUserId: string;
  let type: ConversationType = "DIRECT";
  let beatId: string | null = null;

  if (input.beatSlug) {
    const beat = await findChatTargetByBeatSlug(input.beatSlug);

    if (!beat) {
      throw new Error("chat_target_not_found");
    }

    targetUserId = beat.ownerId;
    beatId = beat.id;
    type = "BEAT_INQUIRY";
  } else if (input.targetProfileSlug) {
    const target = await findChatTargetByProfileSlug(input.targetProfileSlug);

    if (!target) {
      throw new Error("chat_target_not_found");
    }

    targetUserId = target.userId;
  } else {
    throw new Error("chat_target_not_found");
  }

  if (targetUserId === account.id) {
    throw new Error("self_conversation_forbidden");
  }

  const existing = await findExistingConversation({
    userId: account.id,
    targetUserId,
    type,
    beatId,
  });
  const conversation =
    existing ??
    (await createConversation({
      userId: account.id,
      targetUserId,
      type,
      beatId,
    }));
  const [summary] = await serializeConversations({
    conversations: [conversation],
    userId: account.id,
  });

  return summary;
}

/**
 * Liste l'historique d'une conversation autorisee.
 * @param clerkUserId Identifiant Clerk de session.
 * @param conversationId Identifiant conversation.
 * @param page Pagination validee.
 */
export async function listCurrentUserMessages(
  clerkUserId: string,
  conversationId: string,
  page: MessagePageInput,
) {
  const account = await assertCurrentAccount(clerkUserId);
  const conversation = await findParticipantConversation({
    conversationId,
    userId: account.id,
  });

  if (!conversation) {
    throw new Error("conversation_forbidden");
  }

  const messages = await listConversationMessages(conversationId, page);

  return Promise.all(messages.reverse().map(serializeMessage));
}

/**
 * Envoie un message texte dans une conversation autorisee.
 * @param clerkUserId Identifiant Clerk de session.
 * @param conversationId Identifiant conversation.
 * @param input Message valide.
 */
export async function sendCurrentUserMessage(
  clerkUserId: string,
  conversationId: string,
  input: SendMessageInput,
) {
  const account = await assertCurrentAccount(clerkUserId);
  const conversation = await findParticipantConversation({
    conversationId,
    userId: account.id,
  });

  if (!conversation) {
    throw new Error("conversation_forbidden");
  }

  return await serializeMessage(
    await createTextMessage({
      conversationId,
      senderId: account.id,
      input,
    }),
  );
}

/**
 * Marque une conversation lue pour l'utilisateur courant.
 * @param clerkUserId Identifiant Clerk de session.
 * @param conversationId Identifiant conversation.
 */
export async function markCurrentUserConversationRead(
  clerkUserId: string,
  conversationId: string,
) {
  const account = await assertCurrentAccount(clerkUserId);
  const conversation = await findParticipantConversation({
    conversationId,
    userId: account.id,
  });

  if (!conversation) {
    throw new Error("conversation_forbidden");
  }

  await markConversationRead({
    conversationId,
    userId: account.id,
  });

  return { ok: true };
}

/**
 * Compte tous les messages non lus de l'utilisateur courant.
 * @param clerkUserId Identifiant Clerk de session.
 */
export async function getCurrentUserUnreadCount(clerkUserId: string) {
  const conversations = await listCurrentUserConversations(clerkUserId);

  return {
    unreadCount: conversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
  };
}
