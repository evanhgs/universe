"use client";

import {
  LoaderCircle,
  Pause,
  Play,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AudioMeter } from "@/components/audio/audio-meter";
import { AudioTimeline } from "@/components/audio/audio-timeline";
import { VolumeControl } from "@/components/audio/volume-control";
import { Button } from "@/components/ui/button";

type FeedAsset = {
  id: string;
  role: string;
  url: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

type FeedBeat = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  bpm: number | null;
  musicalKey: string | null;
  durationSec: number | null;
  priceAmount: number | null;
  currency: string;
  primaryGenre: string | null;
  primaryMood: string | null;
  tags: string[];
  isFree: boolean;
  seller: {
    slug: string | null;
    displayName: string | null;
  };
  assets: FeedAsset[];
};

type FeedPagePayload = {
  items: FeedBeat[];
  nextCursor: string | null;
  hasMore: boolean;
};

type FeedClientProps = FeedPagePayload;

const FALLBACK_VISUAL_URL = "/beat_music.gif";
const VOLUME_STORAGE_KEY = "universe.feed.volume";

function formatPrice(priceAmount: number | null, currency: string, isFree: boolean) {
  if (isFree || priceAmount === 0) {
    return "Gratuit";
  }

  if (priceAmount === null) {
    return "Prix a definir";
  }

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
  }).format(priceAmount);
}

function getBeatAsset(beat: FeedBeat, role: string) {
  return beat.assets.find((asset) => asset.role === role && asset.url);
}

function warmTone(index: number) {
  const tones = [
    "from-amber-400 via-rose-500 to-fuchsia-700",
    "from-orange-300 via-red-500 to-violet-800",
    "from-yellow-300 via-pink-500 to-stone-950",
    "from-rose-300 via-orange-500 to-emerald-900",
  ];

  return tones[index % tones.length];
}

/**
 * Feed client avec prechargement quand l'avant-avant-avant-dernier beat entre dans le viewport.
 * @param props Premiere page et curseur renvoyes par le serveur.
 */
export function FeedClient({
  items: initialItems,
  nextCursor: initialNextCursor,
  hasMore: initialHasMore,
}: FeedClientProps) {
  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preloadNode, setPreloadNode] = useState<HTMLElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playingBeatId, setPlayingBeatId] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.72);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const activeIndexRef = useRef(0);
  const hasLoadedStoredVolumeRef = useRef(false);
  const navigationLockedRef = useRef(false);
  const loadingRef = useRef(false);

  const preloadIndex = useMemo(() => Math.max(items.length - 4, 0), [items.length]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || !nextCursor) {
      return;
    }

    loadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: "10",
        cursor: nextCursor,
      });
      const response = await fetch(`/api/feed?${params.toString()}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error("feed_fetch_failed");
      }

      const payload = (await response.json()) as FeedPagePayload;

      setItems((currentItems) => {
        const seenIds = new Set(currentItems.map((item) => item.id));
        const freshItems = payload.items.filter((item) => !seenIds.has(item.id));

        return [...currentItems, ...freshItems];
      });
      setNextCursor(payload.nextCursor);
      setHasMore(payload.hasMore);
    } catch {
      setError("Impossible de charger les prochains beats.");
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, [hasMore, nextCursor]);

  const setCardRef = useCallback((index: number, node: HTMLElement | null) => {
    cardRefs.current[index] = node;
  }, []);

  useEffect(() => {
    setPreloadNode(cardRefs.current[preloadIndex] ?? null);
  }, [items.length, preloadIndex]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedVolume = window.localStorage.getItem(VOLUME_STORAGE_KEY);
      hasLoadedStoredVolumeRef.current = true;

      if (storedVolume === null) {
        return;
      }

      const parsedVolume = Number(storedVolume);

      if (Number.isFinite(parsedVolume)) {
        setVolume(Math.min(Math.max(parsedVolume, 0), 1));
        setIsMuted(parsedVolume === 0);
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.volume = isMuted ? 0 : volume;

    if (hasLoadedStoredVolumeRef.current) {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
    }
  }, [isMuted, volume]);

  const findClosestCardIndex = useCallback(() => {
    if (typeof window === "undefined") {
      return activeIndexRef.current;
    }

    const viewportCenter = window.innerHeight / 2;
    let closestIndex = activeIndexRef.current;
    let closestDistance = Number.POSITIVE_INFINITY;

    cardRefs.current.forEach((card, index) => {
      if (!card) {
        return;
      }

      const rect = card.getBoundingClientRect();

      if (rect.width === 0 && rect.height === 0) {
        return;
      }

      const cardCenter = rect.top + rect.height / 2;
      const distance = Math.abs(cardCenter - viewportCenter);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    return closestIndex;
  }, []);

  const playBeat = useCallback(
    async (index: number, source: "autoplay" | "manual") => {
      const beat = items[index];
      const preview = beat ? getBeatAsset(beat, "AUDIO_PREVIEW") : null;
      const audio = audioRef.current;

      if (!beat || !preview?.url || !audio) {
        return;
      }

      if (playingBeatId !== beat.id || audio.src !== preview.url) {
        audio.src = preview.url;
        audio.load();
        setCurrentTime(0);
        setDuration(beat.durationSec ?? 0);
      }

      try {
        setAudioError(null);
        setPlayingBeatId(beat.id);
        await audio.play();
        setIsAudioPlaying(true);
        setAutoplayBlocked(false);
      } catch {
        setIsAudioPlaying(false);

        if (source === "autoplay") {
          setAutoplayBlocked(true);
          return;
        }

        setAudioError("Lecture impossible pour le moment.");
      }
    },
    [items, playingBeatId],
  );

  const pauseAudio = useCallback(() => {
    const audio = audioRef.current;

    audio?.pause();
    setIsAudioPlaying(false);
  }, []);

  const scrollToBeat = useCallback(
    (direction: 1 | -1) => {
      if (navigationLockedRef.current) {
        return;
      }

      const currentIndex = findClosestCardIndex();
      const nextIndex = Math.min(Math.max(currentIndex + direction, 0), items.length - 1);
      const nextCard = cardRefs.current[nextIndex];

      if (!nextCard || nextIndex === currentIndex) {
        return;
      }

      activeIndexRef.current = nextIndex;
      setActiveIndex(nextIndex);
      navigationLockedRef.current = true;
      nextCard.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      window.setTimeout(() => {
        navigationLockedRef.current = false;
      }, 420);
    },
    [findClosestCardIndex, items.length],
  );

  const shouldIgnoreNavigationTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(target.closest("a, button, input, textarea, select, audio"));
  }, []);

  useEffect(() => {
    if (!preloadNode || !hasMore || isLoading) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void loadMore();
        }
      },
      {
        rootMargin: "240px 0px",
        threshold: 0.2,
      },
    );

    observer.observe(preloadNode);

    return () => observer.disconnect();
  }, [hasMore, isLoading, loadMore, preloadNode]);

  useEffect(() => {
    let frameId = 0;

    function updateActiveBeat() {
      frameId = 0;
      const closestIndex = findClosestCardIndex();

      if (closestIndex !== activeIndexRef.current) {
        activeIndexRef.current = closestIndex;
        setActiveIndex(closestIndex);
      }
    }

    function scheduleUpdate() {
      if (frameId) {
        return;
      }

      frameId = window.requestAnimationFrame(updateActiveBeat);
    }

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [findClosestCardIndex, items.length]);

  useEffect(() => {
    const preview = items[activeIndex] ? getBeatAsset(items[activeIndex], "AUDIO_PREVIEW") : null;

    if (!preview?.url) {
      const timeoutId = window.setTimeout(() => {
        pauseAudio();
        setPlayingBeatId(null);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    const timeoutId = window.setTimeout(() => {
      void playBeat(activeIndex, "autoplay");
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeIndex, items, pauseAudio, playBeat]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreNavigationTarget(event.target)) {
        return;
      }

      if (event.key === "ArrowDown" || event.key === " " || event.key === "Enter") {
        event.preventDefault();
        scrollToBeat(event.shiftKey && event.key !== "ArrowDown" ? -1 : 1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        scrollToBeat(-1);
      }
    }

    function onWheel(event: WheelEvent) {
      if (shouldIgnoreNavigationTarget(event.target) || Math.abs(event.deltaY) < 8) {
        return;
      }

      event.preventDefault();
      scrollToBeat(event.deltaY > 0 ? 1 : -1);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("wheel", onWheel);
    };
  }, [scrollToBeat, shouldIgnoreNavigationTarget]);

  function toggleBeatPlayback(index: number) {
    const beat = items[index];

    if (!beat) {
      return;
    }

    if (playingBeatId === beat.id && isAudioPlaying) {
      pauseAudio();
      return;
    }

    setActiveIndex(index);
    void playBeat(index, "manual");
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

  const backgroundClass = isAudioPlaying
    ? "bg-[radial-gradient(circle_at_50%_18%,rgba(251,146,60,0.20),transparent_35%),radial-gradient(circle_at_18%_72%,rgba(244,63,94,0.12),transparent_38%),linear-gradient(180deg,#fff7ed,#f8fafc)] dark:bg-[radial-gradient(circle_at_50%_18%,rgba(251,146,60,0.28),transparent_35%),radial-gradient(circle_at_18%_72%,rgba(244,63,94,0.2),transparent_38%),linear-gradient(180deg,#130c0a,#060404)]"
    : "bg-[radial-gradient(circle_at_50%_18%,rgba(251,146,60,0.10),transparent_34%),linear-gradient(180deg,#fffaf4,#f8fafc)] dark:bg-[radial-gradient(circle_at_50%_18%,rgba(251,146,60,0.16),transparent_34%),linear-gradient(180deg,#110f0d,#070606)]";

  return (
    <div className={`min-h-[calc(100vh-73px)] text-foreground transition-colors dark:text-white ${backgroundClass}`}>
      <audio
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onEnded={() => setIsAudioPlaying(false)}
        onError={() => {
          setIsAudioPlaying(false);
          setAudioError("Preview indisponible pour ce beat.");
        }}
        onPause={() => setIsAudioPlaying(false)}
        onPlay={() => setIsAudioPlaying(true)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        preload="auto"
        ref={audioRef}
      />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-4 md:px-5">
        {items.length === 0 ? (
          <section className="flex min-h-[calc(100vh-120px)] items-center justify-center rounded-lg border border-border bg-card/70 p-8 text-center shadow-2xl shadow-black/10 dark:border-white/10 dark:bg-white/[0.05] dark:shadow-black/25">
            <div>
              <h1 className="text-2xl font-semibold">Aucun beat publie</h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground dark:text-white/60">
                Lance le seed ou publie des beats pour remplir le feed decouverte.
              </p>
            </div>
          </section>
        ) : (
          items.map((beat, index) => {
            const thumbnail = getBeatAsset(beat, "IMAGE_THUMBNAIL");
            const preview = getBeatAsset(beat, "AUDIO_PREVIEW");
            const isActive = activeIndex === index;
            const isCurrentBeat = playingBeatId === beat.id;
            const isPlaying = isCurrentBeat && isAudioPlaying;
            const trackDuration = isCurrentBeat ? duration : beat.durationSec ?? 0;
            const progress = isCurrentBeat ? currentTime : 0;
            const visualUrl = thumbnail?.url ?? FALLBACK_VISUAL_URL;

            return (
              <article
                className={`relative mx-auto min-h-[calc(100vh-116px)] w-full overflow-hidden rounded-lg border shadow-2xl transition-all duration-300 ${
                  isActive
                    ? "border-orange-200/40 shadow-orange-950/40"
                    : "border-white/10 shadow-black/30"
                }`}
                key={beat.id}
                ref={(node) => setCardRef(index, node)}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${warmTone(index)}`} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt=""
                  className={`absolute inset-0 h-full w-full object-cover transition duration-700 ${
                    thumbnail?.url ? "opacity-80" : "opacity-65 saturate-125"
                  } ${isPlaying ? "scale-[1.025]" : "scale-100"}`}
                  src={visualUrl}
                />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_26%,rgba(255,255,255,0.13),transparent_24%),linear-gradient(180deg,rgba(16,9,7,0.12),rgba(16,9,7,0.86))]" />
                <div
                  className={`absolute inset-x-[-18%] bottom-[-32%] h-2/3 rounded-full bg-orange-400/30 blur-3xl transition-opacity duration-500 ${
                    isPlaying ? "opacity-100 animate-pulse" : "opacity-35"
                  }`}
                />

                <div className="relative flex min-h-[calc(100vh-116px)] flex-col justify-end p-4 md:p-6">
                  <div className="max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase text-white/75">
                      {beat.primaryGenre ? (
                        <span className="rounded-full bg-black/25 px-3 py-1 backdrop-blur">
                          {beat.primaryGenre}
                        </span>
                      ) : null}
                      {beat.primaryMood ? (
                        <span className="rounded-full bg-black/25 px-3 py-1 backdrop-blur">
                          {beat.primaryMood}
                        </span>
                      ) : null}
                      {beat.bpm ? (
                        <span className="rounded-full bg-black/25 px-3 py-1 backdrop-blur">
                          {beat.bpm} BPM
                        </span>
                      ) : null}
                      {beat.musicalKey ? (
                        <span className="rounded-full bg-black/25 px-3 py-1 backdrop-blur">
                          {beat.musicalKey}
                        </span>
                      ) : null}
                    </div>

                    <h1 className="mt-3 text-4xl font-semibold text-white md:text-6xl">
                      {beat.title}
                    </h1>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-white/76 md:text-base">
                      {beat.description ?? "Beat disponible sur Universe."}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/72">
                      {beat.tags.slice(0, 5).map((tag) => (
                        <span
                          className="rounded-full border border-white/16 bg-black/24 px-3 py-1 backdrop-blur"
                          key={tag}
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>

                    <div className="mt-5 rounded-lg border border-white/18 bg-card/88 p-3 text-card-foreground shadow-xl shadow-black/20 backdrop-blur-md dark:border-white/12 dark:bg-black/36 dark:text-white">
                      <div className="flex items-center gap-3">
                        <Button
                          aria-label={isPlaying ? "Mettre en pause" : "Lire le beat"}
                          className="size-12 hover:scale-105"
                          disabled={!preview?.url}
                          onClick={() => toggleBeatPlayback(index)}
                          size="icon"
                          type="button"
                          variant="inverse"
                        >
                          {isPlaying ? <Pause size={21} /> : <Play size={21} />}
                        </Button>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-foreground dark:text-white">
                                {preview?.url ? "Preview audio" : "Preview en preparation"}
                              </p>
                              <p className="truncate text-xs text-muted-foreground dark:text-white/55">
                                {beat.seller.displayName ?? beat.seller.slug ?? "Beatmaker"}
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
                            disabled={!isCurrentBeat}
                            duration={trackDuration}
                            onSeek={seekTo}
                            progress={progress}
                            textClassName="text-muted-foreground dark:text-white/58"
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <VolumeControl
                          buttonClassName="border-border bg-background/60 dark:border-white/12 dark:bg-white/10 dark:text-white dark:hover:bg-white/18"
                          isMuted={isMuted}
                          onMuteChange={setIsMuted}
                          onVolumeChange={changeVolume}
                          textClassName="text-muted-foreground dark:text-white/58"
                          volume={volume}
                        />
                        {isActive && autoplayBlocked ? (
                          <span className="text-xs text-amber-700 dark:text-orange-100/78">
                            Appuie sur lecture pour activer l&apos;autoplay.
                          </span>
                        ) : null}
                        {isCurrentBeat && audioError ? (
                          <span className="text-xs text-destructive dark:text-red-100">{audioError}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <Link
                        className="inline-flex h-11 items-center justify-center rounded-full bg-white px-5 text-sm font-semibold text-black transition hover:bg-orange-100"
                        href={`/beats/${beat.slug}`}
                      >
                        Voir licences
                      </Link>
                      <p className="text-sm font-semibold text-white">
                        {formatPrice(beat.priceAmount, beat.currency, beat.isFree)}
                      </p>
                      <p className="text-sm text-white/62">
                        par {beat.seller.displayName ?? beat.seller.slug ?? "Beatmaker"}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}

        <div className="flex min-h-12 items-center justify-center gap-2 text-sm text-muted-foreground dark:text-white/60">
          {isLoading ? (
            <>
              <LoaderCircle className="animate-spin" size={16} />
              Chargement des prochains beats...
            </>
          ) : null}
          {!isLoading && error ? error : null}
          {!isLoading && !error && !hasMore && items.length > 0 ? "Fin du feed disponible." : null}
        </div>
      </div>
    </div>
  );
}
