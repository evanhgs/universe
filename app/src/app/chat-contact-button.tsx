"use client";

import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

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
      <Button
        className={className}
        disabled={disabled || isPending}
        onClick={handleClick}
        type="button"
        variant="outline"
      >
        {isPending ? "Ouverture..." : label}
      </Button>
      {error ? (
        <Alert className="mt-2 py-2" variant="destructive">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}
