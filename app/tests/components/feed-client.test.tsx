import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FeedClient } from "@/app/feed/feed-client";

type ObserverCallback = IntersectionObserverCallback;

const observerCallbacks: ObserverCallback[] = [];
const scrollIntoViewMock = vi.fn();

class IntersectionObserverMock {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds = [];

  constructor(callback: ObserverCallback) {
    observerCallbacks.push(callback);
  }

  disconnect = vi.fn();
  observe = vi.fn();
  takeRecords = vi.fn(() => []);
  unobserve = vi.fn();
}

function beat(id: number) {
  return {
    id: `beat_${id}`,
    slug: `beat-${id}`,
    title: `Beat ${id}`,
    description: null,
    bpm: 120,
    musicalKey: "Am",
    durationSec: 120,
    priceAmount: 29,
    currency: "EUR",
    primaryGenre: "Trap",
    primaryMood: "Dark",
    tags: ["trap", "dark"],
    isFree: false,
    seller: {
      slug: "seed-seller",
      displayName: "Seed Seller",
    },
    assets: [],
  };
}

describe("FeedClient", () => {
  beforeEach(() => {
    observerCallbacks.length = 0;
    scrollIntoViewMock.mockReset();
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);
    HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
  });

  it("loads the next page when the preload beat intersects", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [beat(11), beat(12)],
          nextCursor: null,
          hasMore: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <FeedClient
        hasMore
        items={Array.from({ length: 10 }, (_, index) => beat(index + 1))}
        nextCursor="cursor_1"
      />,
    );

    expect(screen.getByText("Beat 1")).toBeInTheDocument();
    expect(observerCallbacks).toHaveLength(1);

    observerCallbacks[0](
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    await waitFor(() => {
      expect(screen.getByText("Beat 11")).toBeInTheDocument();
    });
    const feedCall = fetchMock.mock.calls.find(([url]) => String(url).startsWith("/api/feed?"));

    expect(feedCall).toEqual([
      expect.stringMatching(/^\/api\/feed\?limit=10&cursor=cursor_1&sessionId=/),
      expect.objectContaining({ cache: "no-store" }),
    ]);
    expect(screen.getByText("Fin du feed disponible.")).toBeInTheDocument();
  });

  it("steps through beats with keyboard and wheel navigation", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());

    render(
      <FeedClient
        hasMore={false}
        items={Array.from({ length: 3 }, (_, index) => beat(index + 1))}
        nextCursor={null}
      />,
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });

    vi.advanceTimersByTime(420);
    scrollIntoViewMock.mockClear();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true }));

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });

    vi.advanceTimersByTime(420);
    scrollIntoViewMock.mockClear();
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: 120 }));

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });

    vi.useRealTimers();
  });
});
