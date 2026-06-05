import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FeedMoodBackdrop } from "@/components/feed/feed-mood-backdrop";

describe("FeedMoodBackdrop", () => {
  it("uses the mapped palette for a known mood", () => {
    render(
      <FeedMoodBackdrop
        beatId="beat_dark"
        bpm={120}
        hasThumbnail
        isPlaying
        primaryMood="Dark"
      />,
    );

    const backdrop = screen.getByTestId("feed-mood-backdrop");

    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    expect(backdrop).toHaveAttribute("data-palette", "dark");
    expect(backdrop).toHaveAttribute("data-source", "mood");
  });

  it("uses a stable fallback palette when mood is missing", () => {
    render(
      <>
        <FeedMoodBackdrop
          beatId="beat_without_mood"
          bpm={112}
          hasThumbnail={false}
          isPlaying={false}
          primaryMood={null}
        />
        <FeedMoodBackdrop
          beatId="beat_without_mood"
          bpm={112}
          hasThumbnail={false}
          isPlaying={false}
          primaryMood={null}
        />
      </>,
    );

    const [firstBackdrop, secondBackdrop] = screen.getAllByTestId("feed-mood-backdrop");

    expect(firstBackdrop).toHaveAttribute("data-source", "fallback");
    expect(secondBackdrop).toHaveAttribute("data-source", "fallback");
    expect(firstBackdrop.dataset.palette).toBe(secondBackdrop.dataset.palette);
  });

  it("makes higher BPM values animate faster than lower BPM values", () => {
    render(
      <>
        <FeedMoodBackdrop
          beatId="beat_slow"
          bpm={72}
          hasThumbnail
          isPlaying
          primaryMood="Chill"
        />
        <FeedMoodBackdrop
          beatId="beat_fast"
          bpm={160}
          hasThumbnail
          isPlaying
          primaryMood="Chill"
        />
      </>,
    );

    const [slowBackdrop, fastBackdrop] = screen.getAllByTestId("feed-mood-backdrop");
    const slowDuration = Number(slowBackdrop.dataset.animationDuration);
    const fastDuration = Number(fastBackdrop.dataset.animationDuration);

    expect(fastDuration).toBeLessThan(slowDuration);
  });

  it("resolves a valid fallback BPM and animation duration when BPM is missing", () => {
    render(
      <FeedMoodBackdrop
        beatId="beat_missing_bpm"
        bpm={null}
        hasThumbnail
        isPlaying={false}
        primaryMood="Dreamy"
      />,
    );

    const backdrop = screen.getByTestId("feed-mood-backdrop");
    const resolvedBpm = Number(backdrop.dataset.bpm);
    const animationDuration = Number(backdrop.dataset.animationDuration);

    expect(resolvedBpm).toBeGreaterThanOrEqual(70);
    expect(resolvedBpm).toBeLessThanOrEqual(155);
    expect(animationDuration).toBeGreaterThanOrEqual(2.4);
    expect(animationDuration).toBeLessThanOrEqual(7.5);
  });
});
