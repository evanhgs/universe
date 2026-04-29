"use client";

import { useEffect, useRef, useState } from "react";

type PreviewStatus = "waiting" | "loading" | "ready" | "error";

type PreviewResponse = {
  preview?: {
    url: string | null;
  };
};

type BeatPreviewPlayerProps = {
  beatSlug: string;
  initialUrl: string | null;
  shouldPoll: boolean;
};

/**
 * Lecteur de preview avec suivi visuel du chargement et polling pendant la generation.
 * @param props.beatSlug Slug du beat utilise pour recharger la preview.
 * @param props.initialUrl URL presignee disponible au rendu serveur.
 * @param props.shouldPoll Indique si la preview peut encore etre generee par le worker.
 */
export function BeatPreviewPlayer({
  beatSlug,
  initialUrl,
  shouldPoll,
}: BeatPreviewPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [previewUrl, setPreviewUrl] = useState(initialUrl);
  const [status, setStatus] = useState<PreviewStatus>(initialUrl ? "loading" : "waiting");

  useEffect(() => {
    if (previewUrl || !shouldPoll) {
      return;
    }

    let isCancelled = false;

    async function loadPreview() {
      try {
        const response = await fetch(`/api/beats/${beatSlug}/preview`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });

        if (response.status === 404) {
          return;
        }

        if (!response.ok) {
          throw new Error("preview_fetch_failed");
        }

        const payload = (await response.json()) as PreviewResponse;
        const url = payload.preview?.url ?? null;

        if (!isCancelled && url) {
          setPreviewUrl(url);
          setStatus("loading");
        }
      } catch {
        if (!isCancelled) {
          setStatus("error");
        }
      }
    }

    void loadPreview();
    const interval = window.setInterval(() => void loadPreview(), 4000);

    return () => {
      isCancelled = true;
      window.clearInterval(interval);
    };
  }, [beatSlug, previewUrl, shouldPoll]);

  useEffect(() => {
    if (!previewUrl) {
      return;
    }

    const audio = audioRef.current;
    audio?.load();
  }, [previewUrl]);

  const label =
    status === "ready"
      ? "Preview prete"
      : status === "loading"
        ? "Chargement de la preview..."
        : status === "error"
          ? "Preview indisponible pour le moment"
          : "Preview en preparation";

  return (
    <div className="mt-6 border border-black/10 bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-black">Preview audio</p>
          <p className="mt-1 text-sm text-black/55">{label}</p>
        </div>
        <div
          aria-hidden="true"
          className="flex h-9 items-center gap-1"
        >
          {[0, 1, 2, 3, 4].map((bar) => (
            <span
              className={`block w-1.5 rounded-full bg-black transition-all ${
                status === "ready"
                  ? "h-5"
                  : status === "loading" || status === "waiting"
                    ? "h-3 animate-pulse"
                    : "h-2 bg-black/30"
              }`}
              key={bar}
              style={{
                animationDelay: `${bar * 120}ms`,
              }}
            />
          ))}
        </div>
      </div>

      {previewUrl ? (
        <audio
          className="mt-4 w-full"
          controls
          onCanPlay={() => setStatus("ready")}
          onError={() => setStatus("error")}
          onLoadStart={() => setStatus("loading")}
          preload="metadata"
          ref={audioRef}
          src={previewUrl}
        />
      ) : (
        <div className="mt-4 h-11 w-full overflow-hidden rounded-full border border-black/10 bg-black/[0.03]">
          <div className="h-full w-1/3 animate-pulse bg-black/10" />
        </div>
      )}
    </div>
  );
}
