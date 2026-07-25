"use client";

import { useEffect, useState } from "react";

import { API_PATHS } from "@/lib/paths";

type JobStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

type JobState = {
  jobId: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  lockedAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  isStale: boolean;
  canRetry: boolean;
  outputAssetStatus: "PENDING" | "PROCESSING" | "READY" | "FAILED";
};

type Props = {
  beatSlug: string;
  pollIntervalMs?: number;
};

/**
 * Affiche l'etat du job de generation de preview pour un beat appartenant
 * au vendeur authentifie, avec un bouton "Relancer" actif lorsque le job est
 * en FAILED ou gele en PROCESSING (audit B6, volet 3).
 *
 * Composant a integrer dans la future page d'edition vendeur. Attend que
 * l'endpoint de relance de preview soit accessible cote routes (deja en place).
 */
export function PreviewJobPanel({ beatSlug, pollIntervalMs = 5000 }: Props) {
  const [state, setState] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = API_PATHS.beats.previewRetry(beatSlug);

    async function fetchState() {
      try {
        const res = await fetch(url, { method: "GET", cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setState(null);
          return;
        }
        const data = (await res.json()) as JobState;
        if (!cancelled) {
          setState(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "fetch_error");
      }
    }

    fetchState();
    // Stop polling once the preview is READY — nothing more to show.
    const timer = setInterval(() => {
      if (state?.status === "READY") return;
      fetchState();
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [beatSlug, pollIntervalMs, state?.status]);

  async function handleRetry() {
    setIsRetrying(true);
    setError(null);
    try {
      const res = await fetch(API_PATHS.beats.previewRetry(beatSlug), { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "retry_failed");
      } else {
        setState(data as JobState);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "retry_error");
    } finally {
      setIsRetrying(false);
    }
  }

  if (!state) {
    return null;
  }

  const label =
    state.status === "READY"
      ? "Preview ready"
      : state.status === "PROCESSING"
        ? state.isStale
          ? `Stuck (worker silent since ${state.lockedAt})`
          : "Generating preview..."
        : state.status === "PENDING"
          ? "Waiting for the audio worker"
          : `Failed: ${state.errorMessage ?? "unknown"}`;

  return (
    <div role="status" aria-live="polite">
      <p>{label}</p>
      <p>
        Attempts: {state.attempts}/{state.maxAttempts}
      </p>
      {state.canRetry ? (
        <button type="button" onClick={handleRetry} disabled={isRetrying}>
          {isRetrying ? "Restarting..." : "Restart preview generation"}
        </button>
      ) : null}
      {error ? <p role="alert">Error: {error}</p> : null}
    </div>
  );
}
