import "server-only";

import type { CreateConversationInput, MessagePageInput, SendMessageInput } from "./chat.types";

export const CHAT_MESSAGE_MAX_LENGTH = 2000;
export const CHAT_MESSAGES_DEFAULT_LIMIT = 50;
export const CHAT_MESSAGES_MAX_LIMIT = 100;

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Normalise un slug public profile/beat.
 * @param value Valeur brute recue du client.
 * @param field Nom du champ pour le message d'erreur.
 */
function parseSlug(value: unknown, field: string) {
  if (typeof value !== "string") {
    throw new Error(`${field} is invalid.`);
  }

  const slug = value.trim();

  if (slug.length < 3 || slug.length > 96 || !slugPattern.test(slug)) {
    throw new Error(`${field} is invalid.`);
  }

  return slug;
}

/**
 * Valide le payload de creation/reprise de conversation V1.
 * @param raw Payload JSON brut.
 */
export function parseCreateConversationInput(raw: unknown): CreateConversationInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("conversation payload is invalid.");
  }

  const input = raw as Record<string, unknown>;
  const targetProfileSlug =
    input.targetProfileSlug === undefined
      ? undefined
      : parseSlug(input.targetProfileSlug, "targetProfileSlug");
  const beatSlug =
    input.beatSlug === undefined ? undefined : parseSlug(input.beatSlug, "beatSlug");

  if (!targetProfileSlug && !beatSlug) {
    throw new Error("targetProfileSlug or beatSlug is required.");
  }

  if (targetProfileSlug && beatSlug) {
    throw new Error("targetProfileSlug and beatSlug cannot be combined.");
  }

  return {
    targetProfileSlug,
    beatSlug,
  };
}

/**
 * Valide un message texte V1.
 * @param raw Payload JSON brut.
 */
export function parseSendMessageInput(raw: unknown): SendMessageInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("message payload is invalid.");
  }

  const body = (raw as Record<string, unknown>).body;

  if (typeof body !== "string") {
    throw new Error("message body is required.");
  }

  const normalized = body.trim();

  if (!normalized) {
    throw new Error("message body is required.");
  }

  if (normalized.length > CHAT_MESSAGE_MAX_LENGTH) {
    throw new Error(`message body must be ${CHAT_MESSAGE_MAX_LENGTH} characters or less.`);
  }

  return {
    body: normalized,
  };
}

/**
 * Valide la pagination d'historique de messages.
 * @param url URL de requete Route Handler.
 */
export function parseMessagePageInput(url: string): MessagePageInput {
  const searchParams = new URL(url).searchParams;
  const beforeRaw = searchParams.get("before");
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : CHAT_MESSAGES_DEFAULT_LIMIT;

  if (!Number.isInteger(limit) || limit < 1 || limit > CHAT_MESSAGES_MAX_LIMIT) {
    throw new Error(`limit must be between 1 and ${CHAT_MESSAGES_MAX_LIMIT}.`);
  }

  if (!beforeRaw) {
    return { limit };
  }

  const before = new Date(beforeRaw);

  if (Number.isNaN(before.getTime())) {
    throw new Error("before is invalid.");
  }

  return {
    before,
    limit,
  };
}
