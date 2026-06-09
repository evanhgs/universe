"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type KeyboardEvent,
  type SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Alert } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

function conversationAvatarParticipant(conversation: ConversationSummary) {
  return conversation.otherParticipants[0] ?? conversation.participants[0] ?? null;
}

function userInitials(user: { displayName: string | null; slug: string | null } | null) {
  const label = user?.displayName ?? user?.slug ?? "U";
  const words = label.trim().split(/\s+/).filter(Boolean);
  const initials = words.length > 1
    ? `${words[0][0]}${words[1][0]}`
    : label.slice(0, 2);

  return initials.toUpperCase();
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
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, selectedConversationIdForLoad]);

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
    <main className="mx-auto flex h-[calc(100dvh-73px)] w-full max-w-6xl flex-col px-6 pb-8 pt-10">
      <section className="border-b border-border pb-6">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
          Messagerie
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
          {conversations.length > 1 ? 'Conversations' : 'Conversation'}
        </h1>
      </section>

      {error ? (
        <Alert className="mt-5" variant="destructive">
          {error}
        </Alert>
      ) : null}

      <section className="mt-8 grid min-h-0 flex-1 overflow-hidden border border-border bg-card lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border-b border-border lg:border-b-0 lg:border-r">
          {isLoading ? (
            <p className="p-5 text-sm text-muted-foreground">Chargement des conversations...</p>
          ) : conversations.length === 0 ? (
            <div className="p-5">
              <h2 className="font-semibold text-foreground">Aucune conversation</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Vous pouvez contacter un vendeur depuis son profil ou depuis le catalogue avant d&#39;effectuer un achat.
              </p>
              <Link className="mt-4 inline-flex text-sm font-medium text-foreground" href="/beats">
                Explorer le catalogue
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {conversations.map((conversation) => {
                const avatarParticipant = conversationAvatarParticipant(conversation);

                return (
                  <button
                    className={`flex w-full gap-3 p-4 text-left hover:bg-muted ${
                      selectedConversation?.id === conversation.id ? "bg-muted" : ""
                    }`}
                    key={conversation.id}
                    onClick={() => selectConversation(conversation.id)}
                    type="button"
                  >
                    <Avatar className="size-10">
                      {avatarParticipant?.avatarUrl ? (
                        <AvatarImage alt="" src={avatarParticipant.avatarUrl} />
                      ) : null}
                      <AvatarFallback>{userInitials(avatarParticipant)}</AvatarFallback>
                    </Avatar>
                    <span className="grid min-w-0 flex-1 gap-2">
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {conversationTitle(conversation)}
                        </span>
                        {conversation.unreadCount > 0 ? (
                          <Badge className="min-w-6 justify-center px-2 py-0" variant="primary">
                            {conversation.unreadCount}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="line-clamp-2 text-sm leading-5 text-muted-foreground">
                        {conversation.lastMessage?.body ?? "Conversation ouverte."}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
          {selectedConversation ? (
            <>
              <header className="border-b border-border p-5">
                <h2 className="text-xl font-semibold text-foreground">
                  {conversationTitle(selectedConversation)}
                </h2>
                {selectedConversation.beat ? (
                  <Link
                    className="mt-1 inline-flex text-sm text-muted-foreground hover:text-foreground"
                    href={`/beats/${selectedConversation.beat.slug}`}
                  >
                    Voir l&apos;instrumentale
                  </Link>
                ) : null}
              </header>

              <div className="min-h-0 space-y-4 overflow-y-auto p-5">
                {messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun message pour le moment.</p>
                ) : (
                  messages.map((message) => (
                    <article className="max-w-2xl" key={message.id}>
                      <div className="flex items-baseline gap-3">
                        <p className="text-sm font-semibold text-foreground">
                          {message.sender?.displayName ?? message.sender?.slug ?? "Utilisateur"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatMessageDate(message.createdAt)}
                        </p>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                        {message.body}
                      </p>
                    </article>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <form className="border-t border-border p-5" onSubmit={handleSubmit}>
                <label className="sr-only" htmlFor="chat-message">
                  Message
                </label>
                <Textarea
                  className="min-h-24 resize-y rounded-none"
                  id="chat-message"
                  maxLength={2000}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleMessageKeyDown}
                  placeholder="Ecrivez votre message..."
                  value={draft}
                />
                <div className="mt-3 flex items-center justify-between gap-4">
                  <p className="text-xs text-muted-foreground">{draft.trim().length}/2000</p>
                  <Button
                    disabled={isSending || draft.trim().length === 0}
                    type="submit"
                  >
                    {isSending ? "Envoi..." : "Envoyer"}
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
              Selectionne une conversation.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
