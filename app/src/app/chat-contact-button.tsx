"use client";

import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ChatContactButtonProps = {
  beatSlug?: string;
  className?: string;
  disabled?: boolean;
  label: string;
  targetProfileSlug?: string;
};

/**
 * Bouton client qui cree/reprend une conversation puis ouvre la messagerie.
 * @param props Cible profil ou beat.
 */
export function ChatContactButton({
  beatSlug,
  className,
  disabled = false,
  label,
  targetProfileSlug,
}: ChatContactButtonProps) {
  const { getToken } = useAuth();
  const { openSignIn } = useClerk();
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Lance la creation ou reprise de conversation.
   */
  async function handleClick() {
    if (!isLoaded || disabled || isPending) {
      return;
    }

    if (!isSignedIn) {
      openSignIn();
      return;
    }

    setIsPending(true);
    setError(null);

    try {
      const token = await getToken();
      const response = await fetch("/api/chat/conversations", {
        body: JSON.stringify({
          ...(beatSlug ? { beatSlug } : {}),
          ...(targetProfileSlug ? { targetProfileSlug } : {}),
        }),
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        method: "POST",
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
        throw new Error(
          body && typeof body.message === "string" ? body.message : response.statusText,
        );
      }

      const conversation = (await response.json()) as { id: string };
      router.push(`/account/messages?conversationId=${conversation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div>
      <button
        className={
          className ??
          "inline-flex h-10 items-center justify-center rounded-full border border-black/15 px-4 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
        }
        disabled={disabled || isPending}
        onClick={handleClick}
        type="button"
      >
        {isPending ? "Ouverture..." : label}
      </button>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
