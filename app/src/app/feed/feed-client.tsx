"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

function cardTone(index: number) {
  const tones = [
    "from-rose-500 via-orange-400 to-amber-300",
    "from-emerald-500 via-teal-400 to-cyan-300",
    "from-indigo-500 via-sky-400 to-lime-300",
    "from-zinc-900 via-neutral-700 to-stone-400",
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
  const cardRefs = useRef<Array<HTMLElement | null>>([]);
  const activeIndexRef = useRef(0);
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

  return (
    <div className="min-h-[calc(100vh-73px)]  text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 md:px-6">
        {items.length === 0 ? (
          <section className="flex min-h-[calc(100vh-120px)] items-center justify-center border border-white/10 bg-white/[0.04] p-8 text-center">
            <div>
              <h1 className="text-2xl font-semibold">Aucun beat publie</h1>
              <p className="mt-3 text-sm leading-6 text-white/60">
                Lance le seed ou publie des beats pour remplir le feed decouverte.
              </p>
            </div>
          </section>
        ) : (
          items.map((beat, index) => {
            const thumbnail = beat.assets.find((asset) => asset.role === "IMAGE_THUMBNAIL");
            const preview = beat.assets.find((asset) => asset.role === "AUDIO_PREVIEW");

            return (
              <article
                className="relative min-h-[calc(100vh-113px)] overflow-hidden border border-white/10 "
                key={beat.id}
                ref={(node) => setCardRef(index, node)}
              >
                {thumbnail?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    src={thumbnail.url}
                  />
                ) : (
                  <div className={`absolute inset-0 bg-gradient-to-br ${cardTone(index)}`} />
                )}
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.72))]" />

                <div className="relative flex min-h-[calc(100vh-113px)] flex-col justify-end p-5 md:p-8">
                  <div className="max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase text-white/75">
                      {beat.primaryGenre ? <span>{beat.primaryGenre}</span> : null}
                      {beat.primaryMood ? <span>{beat.primaryMood}</span> : null}
                      {beat.bpm ? <span>{beat.bpm} BPM</span> : null}
                      {beat.musicalKey ? <span>{beat.musicalKey}</span> : null}
                    </div>
                    <h1 className="mt-3 text-4xl font-semibold text-white md:text-6xl">
                      {beat.title}
                    </h1>
                    <p className="mt-3 max-w-xl text-sm leading-6 text-white/72 md:text-base">
                      {beat.description ?? "Beat disponible sur Universe."}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/70">
                      {beat.tags.slice(0, 5).map((tag) => (
                        <span className="border border-white/20 bg-black/20 px-3 py-1" key={tag}>
                          #{tag}
                        </span>
                      ))}
                    </div>

                    {preview?.url ? (
                      <audio
                        className="mt-5 w-full max-w-xl"
                        controls
                        preload="metadata"
                        src={preview.url}
                      />
                    ) : null}

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <Link
                        className="inline-flex h-11 items-center justify-center bg-white px-5 text-sm font-semibold text-black"
                        href={`/beats/${beat.slug}`}
                      >
                        Voir licences
                      </Link>
                      <p className="text-sm font-medium text-white/82">
                        {formatPrice(beat.priceAmount, beat.currency, beat.isFree)}
                      </p>
                      <p className="text-sm text-white/58">
                        par {beat.seller.displayName ?? beat.seller.slug ?? "Beatmaker"}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}

        <div className="flex min-h-12 items-center justify-center text-sm text-white/55">
          {isLoading ? "Chargement des prochains beats..." : null}
          {!isLoading && error ? error : null}
          {!isLoading && !error && !hasMore && items.length > 0 ? "Fin du feed disponible." : null}
        </div>
      </div>
    </div>
  );
}
