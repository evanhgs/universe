"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import { AudioMeter } from "@/components/audio/audio-meter";
import { AudioTimeline } from "@/components/audio/audio-timeline";
import { VolumeControl } from "@/components/audio/volume-control";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { API_PATHS } from "@/lib/paths";

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
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.72);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (previewUrl || !shouldPoll) {
      return;
    }

    let isCancelled = false;

    async function loadPreview() {
      try {
        const response = await fetch(API_PATHS.beats.preview(beatSlug), {
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

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.volume = isMuted ? 0 : volume;
  }, [isMuted, volume]);

  async function togglePlayback() {
    const audio = audioRef.current;

    if (!audio || !previewUrl) {
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    try {
      setAudioError(null);
      await audio.play();
      setIsPlaying(true);
      setStatus("ready");
    } catch {
      setIsPlaying(false);
      setAudioError("Lecture impossible pour le moment.");
    }
  }

  function seekTo(value: number) {
    const audio = audioRef.current;

    if (!audio || !Number.isFinite(value)) {
      return;
    }

    audio.currentTime = value;
    setCurrentTime(value);
  }

  function changeVolume(nextVolume: number) {
    const safeVolume = Math.min(Math.max(nextVolume, 0), 1);

    setVolume(safeVolume);
    setIsMuted(safeVolume === 0);
  }

  const label =
    status === "ready"
      ? "Preview prete"
      : status === "loading"
        ? "Chargement de la preview..."
        : status === "error"
          ? "Preview indisponible pour le moment"
          : "Preview en preparation";

  return (
    <Card className="mt-6 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Preview audio</p>
          <p className="mt-1 text-sm text-muted-foreground">{label}</p>
        </div>
        <AudioMeter isActive={isPlaying || status === "loading" || status === "waiting"} />
      </div>

      {previewUrl ? (
        <div className="mt-5 rounded-lg border border-border bg-card p-3 text-card-foreground">
          <audio
            onCanPlay={() => setStatus("ready")}
            onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
            onEnded={() => {
              setCurrentTime(0);
              setIsPlaying(false);
            }}
            onError={() => {
              setAudioError("Preview audio indisponible.");
              setIsPlaying(false);
              setStatus("error");
            }}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
            preload="metadata"
            ref={audioRef}
            src={previewUrl}
          />
          <div className="flex items-center gap-3">
            <Button
              aria-label={isPlaying ? "Mettre en pause" : "Lire la preview"}
              className="size-12 hover:scale-105"
              onClick={() => void togglePlayback()}
              size="icon"
              type="button"
              variant="inverse"
            >
              {isPlaying ? <Pause size={21} /> : <Play size={21} />}
            </Button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {"Preview audio"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {"Extrait du beat"}
                  </p>
                </div>

                <AudioMeter
                  barCount={6}
                  className="shrink-0 text-accent"
                  isActive={isPlaying}
                  tone="accent"
                />
              </div>

              <AudioTimeline
                className="mt-3"
                disabled={status !== "ready"}
                duration={duration}
                onSeek={seekTo}
                progress={currentTime}
                textClassName="text-muted-foreground"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <VolumeControl
              buttonClassName="border-border bg-background/60"
              isMuted={isMuted}
              onMuteChange={setIsMuted}
              onVolumeChange={changeVolume}
              textClassName="text-muted-foreground"
              volume={volume}
            />
            {audioError ? (
              <span className="text-xs text-destructive">{audioError}</span>
            ) : null}
          </div>
        </div>
      ) : (
        <Skeleton className="mt-4 h-11 w-full rounded-full" />
      )}
    </Card>
  );
}
