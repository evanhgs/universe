import "server-only";

import type { ConversationType, MessageType } from "../../../generated/prisma/enums";

export type CreateConversationInput = {
  targetProfileSlug?: string;
  beatSlug?: string;
};

export type SendMessageInput = {
  body: string;
};

export type CreateChatOfferInput = {
  amount: number;
  message?: string;
};

export type MessagePageInput = {
  before?: Date;
  limit: number;
};

export type ChatUserPayload = {
  id: string;
  displayName: string | null;
  slug: string | null;
  avatarUrl: string | null;
};

export type ChatBeatPayload = {
  id: string;
  slug: string;
  title: string;
  exclusiveOffering: {
    id: string;
    title: string | null;
    priceAmount: number;
    currency: string;
  } | null;
} | null;

export type MessageOfferPayload = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  beatTitle: string;
  beatSlug: string;
  direction: "buyer_offer" | "seller_offer";
};

export type MessagePayload = {
  id: string;
  conversationId: string;
  sender: ChatUserPayload | null;
  type: MessageType;
  body: string | null;
  offer: MessageOfferPayload | null;
  createdAt: string;
  editedAt: string | null;
};

export type ConversationSummary = {
  id: string;
  type: ConversationType;
  beat: ChatBeatPayload;
  participants: ChatUserPayload[];
  otherParticipants: ChatUserPayload[];
  lastMessage: MessagePayload | null;
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
};
