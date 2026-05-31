"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type KeyboardEvent, type SyntheticEvent, useEffect, useMemo, useState } from "react";

import type {
  ConversationSummary,
  MessagePayload,
} from "@/server/chat/chat.types";

type JsonBody = {
  message?: unknown;
};

/**
 * Extrait un message d'erreur lisible d'une reponse API.
 * @param response Reponse fetch.
 */
async function readJsonOrThrow<T>(response: Response): Promise<T> {
  if (response.ok) {
    return response.json() as Promise<T>;
  }

  const body = (await response.json().catch(() => null)) as JsonBody | null;
  const message =
    body && typeof body === "object" && "message" in body
      ? String(body.message)
      : response.statusText;

  throw new Error(message);
}

/**
 * Formate une date de message pour l'interface.
 * @param value Date ISO.
 */
function formatMessageDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/**
 * Traduit les codes erreur chat en message utilisateur.
 * @param error Code ou message brut.
 */
function userMessage(error: string) {
  if (error === "conversation_forbidden") {
    return "Cette conversation n'est pas accessible avec ton compte.";
  }

  if (error === "message body is required.") {
    return "Ecris un message avant d'envoyer.";
  }

  return error;
}

/**
 * Retourne le nom public des interlocuteurs hors utilisateur courant quand possible.
 * @param conversation Conversation a afficher.
 */
function conversationTitle(conversation: ConversationSummary) {
  const otherNames = (conversation.otherParticipants ?? [])
    .map((participant) => participant.displayName ?? participant.slug)
    .filter(Boolean)
    .join(" / ");

  if (conversation.beat) {
    return otherNames ? `${otherNames} : ${conversation.beat.title}` : conversation.beat.title;
  }

  return (
    otherNames ||
    conversation.participants
      .map((participant) => participant.displayName ?? participant.slug)
      .filter(Boolean)
      .join(" / ") ||
    "Utilisateur"
  );
}

/**
 * Client de messagerie REST V1.
 * @returns Interface inbox + fil selectionne.
 */
export function MessagesClient() {
  const { getToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedConversationId = searchParams.get("conversationId");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [messages, setMessages] = useState<MessagePayload[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === selectedConversationId) ??
      conversations[0] ??
      null,
    [conversations, selectedConversationId],
  );
  const selectedConversationIdForLoad = selectedConversation?.id ?? null;

  useEffect(() => {
    let isCancelled = false;

    /**
     * Charge l'inbox depuis l'API privee.
     */
    async function run() {
      setIsLoading(true);
      setError(null);

      try {
        const token = await getToken();
        const response = await fetch("/api/chat/conversations", {
          credentials: "same-origin",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const payload = await readJsonOrThrow<ConversationSummary[]>(response);

        if (!isCancelled) {
          setConversations(payload);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(userMessage(err instanceof Error ? err.message : "Erreur inconnue."));
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void run();

    return () => {
      isCancelled = true;
    };
  }, [getToken]);

  useEffect(() => {
    if (!selectedConversationIdForLoad) {
      return;
    }

    let isCancelled = false;

    /**
     * Charge les messages du fil courant et marque la conversation lue.
     */
    async function run() {
      setError(null);

      try {
        const token = await getToken();
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const response = await fetch(
          `/api/chat/conversations/${selectedConversationIdForLoad}/messages`,
          {
            credentials: "same-origin",
            headers,
          },
        );
        const payload = await readJsonOrThrow<MessagePayload[]>(response);

        await fetch(`/api/chat/conversations/${selectedConversationIdForLoad}/read`, {
          credentials: "same-origin",
          headers,
          method: "PATCH",
        });

        if (!isCancelled) {
          setMessages(payload);
          setConversations((current) =>
            current.map((conversation) =>
              conversation.id === selectedConversationIdForLoad
                ? { ...conversation, unreadCount: 0 }
                : conversation,
            ),
          );
        }
      } catch (err) {
        if (!isCancelled) {
          setError(userMessage(err instanceof Error ? err.message : "Erreur inconnue."));
        }
      }
    }

    void run();

    return () => {
      isCancelled = true;
    };
  }, [getToken, selectedConversationIdForLoad]);

  /**
   * Selectionne une conversation via query string.
   * @param conversationId Identifiant conversation.
   */
  function selectConversation(conversationId: string) {
    router.replace(`/account/messages?conversationId=${conversationId}`);
  }

  /**
   * Envoie le brouillon courant.
   * @param event Soumission formulaire.
   */
  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedConversation || isSending) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const token = await getToken();
      const response = await fetch(
        `/api/chat/conversations/${selectedConversation.id}/messages`,
        {
          body: JSON.stringify({ body: draft }),
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          method: "POST",
        },
      );
      const message = await readJsonOrThrow<MessagePayload>(response);

      setMessages((current) => [...current, message]);
      setDraft("");
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === selectedConversation.id
            ? {
                ...conversation,
                lastMessage: message,
                lastMessageAt: message.createdAt,
              }
            : conversation,
        ),
      );
    } catch (err) {
      setError(userMessage(err instanceof Error ? err.message : "Erreur inconnue."));
    } finally {
      setIsSending(false);
    }
  }

  /**
   * Envoie avec Entree et conserve Shift + Entree pour les retours a la ligne.
   * @param event Touche pressee dans le champ message.
   */
  function handleMessageKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();

    if (draft.trim().length === 0 || isSending) {
      return;
    }

    event.currentTarget.form?.requestSubmit();
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-6xl px-6 py-10">
      <section className="border-b border-black/10 pb-6">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-black/45">
          Messagerie
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-black">
          {conversations.length > 1 ? 'Conversations' : 'Conversation'}
        </h1>
      </section>

      {error ? (
        <p className="mt-5 border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="mt-8 grid min-h-[560px] border border-black/10 bg-white lg:grid-cols-[320px_1fr]">
        <aside className="border-b border-black/10 lg:border-b-0 lg:border-r">
          {isLoading ? (
            <p className="p-5 text-sm text-black/55">Chargement des conversations...</p>
          ) : conversations.length === 0 ? (
            <div className="p-5">
              <h2 className="font-semibold text-black">Aucune conversation</h2>
              <p className="mt-2 text-sm leading-6 text-black/60">
                Vous pouvez contacter un vendeur depuis son profil ou depuis le catalogue avant d&#39;effectuer un achat.
              </p>
              <Link className="mt-4 inline-flex text-sm font-medium text-black" href="/beats">
                Explorer le catalogue
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-black/10">
              {conversations.map((conversation) => (
                <button
                  className={`grid w-full gap-2 p-4 text-left hover:bg-black/[0.03] ${
                    selectedConversation?.id === conversation.id ? "bg-black/[0.04]" : ""
                  }`}
                  key={conversation.id}
                  onClick={() => selectConversation(conversation.id)}
                  type="button"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-semibold text-black">
                      {conversationTitle(conversation)}
                    </span>
                    {conversation.unreadCount > 0 ? (
                      <span className="min-w-6 rounded-full bg-black px-2 py-0.5 text-center text-xs font-semibold text-white">
                        {conversation.unreadCount}
                      </span>
                    ) : null}
                  </span>
                  {/*TODO: ajouter la photo de profil à coté du pseudo*/}
                  <span className="line-clamp-2 text-sm leading-5 text-black/55">
                    {conversation.lastMessage?.body ?? "Conversation ouverte."}
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className="grid min-h-[560px] grid-rows-[auto_1fr_auto]">
          {selectedConversation ? (
            <>
              <header className="border-b border-black/10 p-5">
                <h2 className="text-xl font-semibold text-black">
                  {conversationTitle(selectedConversation)}
                </h2>
                {selectedConversation.beat ? (
                  <Link
                    className="mt-1 inline-flex text-sm text-black/55 hover:text-black"
                    href={`/beats/${selectedConversation.beat.slug}`}
                  >
                    Voir l&apos;instrumentale
                  </Link>
                ) : null}
              </header>

              <div className="space-y-4 overflow-y-auto p-5">
                {messages.length === 0 ? (
                  <p className="text-sm text-black/55">Aucun message pour le moment.</p>
                ) : (
                  messages.map((message) => (
                    <article className="max-w-2xl" key={message.id}>
                      <div className="flex items-baseline gap-3">
                        <p className="text-sm font-semibold text-black">
                          {message.sender?.displayName ?? message.sender?.slug ?? "Utilisateur"}
                        </p>
                        <p className="text-xs text-black/40">
                          {formatMessageDate(message.createdAt)}
                        </p>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-black/70">
                        {message.body}
                      </p>
                    </article>
                  ))
                )}
              </div>

              <form className="border-t border-black/10 p-5" onSubmit={handleSubmit}>
                <label className="sr-only" htmlFor="chat-message">
                  Message
                </label>
                <textarea
                  className="min-h-24 w-full resize-y border border-black/15 p-3 text-sm text-black outline-none focus:border-black"
                  id="chat-message"
                  maxLength={2000}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleMessageKeyDown}
                  placeholder="Ecrivez votre message..."
                  value={draft}
                />
                <div className="mt-3 flex items-center justify-between gap-4">
                  <p className="text-xs text-black/40">{draft.trim().length}/2000</p>
                  <button
                    className="inline-flex h-10 items-center justify-center rounded-full bg-black px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-black/30"
                    disabled={isSending || draft.trim().length === 0}
                    type="submit"
                  >
                    {isSending ? "Envoi..." : "Envoyer"}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex items-center justify-center p-8 text-sm text-black/55">
              Selectionne une conversation.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
