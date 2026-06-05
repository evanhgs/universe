import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

type MoodPaletteKey =
  | "dark"
  | "happy"
  | "sad"
  | "chill"
  | "romantic"
  | "epic"
  | "dreamy";

type MoodPalette = {
  aliases: string[];
  accent: string;
  gradient: string;
  glow: string;
  key: MoodPaletteKey;
  orbit: string;
};

type FeedMoodBackdropProps = {
  beatId: string;
  bpm: number | null;
  className?: string;
  hasThumbnail: boolean;
  isPlaying: boolean;
  primaryMood: string | null;
};

type FeedMoodVisual = {
  animationDurationSeconds: number;
  bpm: number;
  paletteKey: MoodPaletteKey;
  source: "mood" | "fallback";
};

const MIN_BPM = 20;
const MAX_BPM = 300;
const FALLBACK_MIN_BPM = 70;
const FALLBACK_MAX_BPM = 155;
const MIN_DURATION_SECONDS = 2.4;
const MAX_DURATION_SECONDS = 7.5;

const MOOD_PALETTES: MoodPalette[] = [
  {
    key: "dark",
    aliases: ["dark", "aggressive", "angry", "rage", "hard", "evil"],
    accent: "rgba(248, 113, 113, 0.68)",
    gradient:
      "linear-gradient(135deg, #16081f 0%, #5b1444 38%, #b91c1c 68%, #111827 100%)",
    glow:
      "radial-gradient(circle, rgba(248, 113, 113, 0.58), rgba(109, 40, 217, 0.28) 42%, transparent 72%)",
    orbit:
      "radial-gradient(circle at 24% 28%, rgba(236, 72, 153, 0.34), transparent 34%), radial-gradient(circle at 72% 62%, rgba(220, 38, 38, 0.38), transparent 38%)",
  },
  {
    key: "happy",
    aliases: ["happy", "uplifting", "fun", "joy", "bright", "summer"],
    accent: "rgba(34, 211, 238, 0.66)",
    gradient:
      "linear-gradient(135deg, #fde047 0%, #fb7185 38%, #22d3ee 72%, #7c3aed 100%)",
    glow:
      "radial-gradient(circle, rgba(253, 224, 71, 0.56), rgba(34, 211, 238, 0.32) 46%, transparent 74%)",
    orbit:
      "radial-gradient(circle at 18% 36%, rgba(251, 191, 36, 0.4), transparent 32%), radial-gradient(circle at 78% 58%, rgba(34, 211, 238, 0.4), transparent 36%)",
  },
  {
    key: "sad",
    aliases: ["sad", "melancholic", "melancholy", "emotional", "lonely"],
    accent: "rgba(129, 140, 248, 0.68)",
    gradient:
      "linear-gradient(135deg, #172554 0%, #3730a3 42%, #8b5cf6 70%, #1e1b4b 100%)",
    glow:
      "radial-gradient(circle, rgba(129, 140, 248, 0.54), rgba(56, 189, 248, 0.22) 42%, transparent 72%)",
    orbit:
      "radial-gradient(circle at 24% 32%, rgba(59, 130, 246, 0.36), transparent 34%), radial-gradient(circle at 70% 68%, rgba(167, 139, 250, 0.38), transparent 38%)",
  },
  {
    key: "chill",
    aliases: ["chill", "relaxed", "calm", "smooth", "lofi", "laid back"],
    accent: "rgba(45, 212, 191, 0.62)",
    gradient:
      "linear-gradient(135deg, #064e3b 0%, #14b8a6 38%, #a78bfa 72%, #0f172a 100%)",
    glow:
      "radial-gradient(circle, rgba(45, 212, 191, 0.5), rgba(167, 139, 250, 0.28) 44%, transparent 74%)",
    orbit:
      "radial-gradient(circle at 20% 34%, rgba(16, 185, 129, 0.38), transparent 34%), radial-gradient(circle at 78% 62%, rgba(167, 139, 250, 0.34), transparent 38%)",
  },
  {
    key: "romantic",
    aliases: ["romantic", "sensual", "love", "sexy", "intimate"],
    accent: "rgba(244, 114, 182, 0.66)",
    gradient:
      "linear-gradient(135deg, #831843 0%, #f472b6 36%, #a855f7 68%, #2e1065 100%)",
    glow:
      "radial-gradient(circle, rgba(244, 114, 182, 0.56), rgba(168, 85, 247, 0.3) 44%, transparent 74%)",
    orbit:
      "radial-gradient(circle at 26% 30%, rgba(251, 113, 133, 0.38), transparent 34%), radial-gradient(circle at 76% 66%, rgba(217, 70, 239, 0.36), transparent 38%)",
  },
  {
    key: "epic",
    aliases: ["epic", "cinematic", "triumphant", "dramatic", "orchestral"],
    accent: "rgba(251, 191, 36, 0.68)",
    gradient:
      "linear-gradient(135deg, #451a03 0%, #d97706 34%, #be123c 64%, #312e81 100%)",
    glow:
      "radial-gradient(circle, rgba(251, 191, 36, 0.58), rgba(190, 18, 60, 0.3) 42%, transparent 74%)",
    orbit:
      "radial-gradient(circle at 22% 34%, rgba(245, 158, 11, 0.42), transparent 34%), radial-gradient(circle at 76% 62%, rgba(99, 102, 241, 0.34), transparent 38%)",
  },
  {
    key: "dreamy",
    aliases: ["dreamy", "ambient", "space", "ethereal", "float"],
    accent: "rgba(125, 211, 252, 0.66)",
    gradient:
      "linear-gradient(135deg, #164e63 0%, #38bdf8 34%, #c084fc 68%, #f9a8d4 100%)",
    glow:
      "radial-gradient(circle, rgba(125, 211, 252, 0.52), rgba(216, 180, 254, 0.32) 44%, transparent 74%)",
    orbit:
      "radial-gradient(circle at 22% 34%, rgba(56, 189, 248, 0.36), transparent 34%), radial-gradient(circle at 78% 62%, rgba(244, 114, 182, 0.34), transparent 38%)",
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function normalizeMood(primaryMood: string | null) {
  const normalized = primaryMood
    ?.trim()
    .toLowerCase()
    .replace(/[_/-]+/g, " ")
    .replace(/\s+/g, " ");

  return normalized ?? "";
}

function findMoodPalette(primaryMood: string | null) {
  const normalizedMood = normalizeMood(primaryMood);

  if (!normalizedMood) {
    return null;
  }

  const moodTokens = new Set(normalizedMood.split(" "));
  moodTokens.add(normalizedMood);

  return (
    MOOD_PALETTES.find((palette) =>
      palette.aliases.some((alias) => moodTokens.has(alias) || normalizedMood.includes(alias)),
    ) ?? null
  );
}

function resolveBpm(beatId: string, bpm: number | null) {
  if (typeof bpm === "number" && Number.isFinite(bpm) && bpm >= MIN_BPM && bpm <= MAX_BPM) {
    return bpm;
  }

  return FALLBACK_MIN_BPM + (hashString(`${beatId}:bpm`) % (FALLBACK_MAX_BPM - FALLBACK_MIN_BPM + 1));
}

function durationFromBpm(bpm: number) {
  const normalized = (clamp(bpm, MIN_BPM, MAX_BPM) - MIN_BPM) / (MAX_BPM - MIN_BPM);
  const duration =
    MAX_DURATION_SECONDS - normalized * (MAX_DURATION_SECONDS - MIN_DURATION_SECONDS);

  return Math.round(duration * 100) / 100;
}

function getMoodPalette(paletteKey: MoodPaletteKey) {
  return MOOD_PALETTES.find((item) => item.key === paletteKey) ?? MOOD_PALETTES[0];
}

export function resolveFeedMoodVisual({
  beatId,
  bpm,
  primaryMood,
}: Pick<FeedMoodBackdropProps, "beatId" | "bpm" | "primaryMood">): FeedMoodVisual {
  const moodPalette = findMoodPalette(primaryMood);
  const palette = moodPalette ?? MOOD_PALETTES[hashString(`${beatId}:mood`) % MOOD_PALETTES.length];
  const resolvedBpm = resolveBpm(beatId, bpm);

  return {
    animationDurationSeconds: durationFromBpm(resolvedBpm),
    bpm: resolvedBpm,
    paletteKey: palette.key,
    source: moodPalette ? "mood" : "fallback",
  };
}

export function FeedMoodBackdrop({
  beatId,
  bpm,
  className,
  hasThumbnail,
  isPlaying,
  primaryMood,
}: FeedMoodBackdropProps) {
  const visual = resolveFeedMoodVisual({ beatId, bpm, primaryMood });
  const palette = getMoodPalette(visual.paletteKey);
  const motionDuration = isPlaying
    ? visual.animationDurationSeconds
    : Math.min(visual.animationDurationSeconds * 1.75, 12);
  const baseOpacity = hasThumbnail ? 0.78 : 0.94;
  const playingOpacity = hasThumbnail ? 0.92 : 1;
  const opacity = isPlaying ? playingOpacity : baseOpacity;

  const rootStyle = {
    animation: `feedMoodShift ${motionDuration}s ease-in-out infinite alternate`,
    background: palette.gradient,
    backgroundSize: "190% 190%",
    opacity,
  } satisfies CSSProperties;
  const orbitStyle = {
    animation: `feedMoodOrbit ${Math.max(motionDuration * 1.35, 4.2)}s ease-in-out infinite alternate`,
    background: palette.orbit,
    opacity: isPlaying ? 0.78 : 0.48,
  } satisfies CSSProperties;
  const glowStyle = {
    animation: `feedMoodPulse ${Math.max(motionDuration * 0.85, 2.2)}s ease-in-out infinite alternate`,
    background: palette.glow,
    opacity: isPlaying ? 0.98 : 0.52,
  } satisfies CSSProperties;
  const accentStyle = {
    background: palette.accent,
    opacity: isPlaying ? 0.3 : 0.16,
  } satisfies CSSProperties;

  return (
    <div
      aria-hidden="true"
      className={cn("absolute inset-0 overflow-hidden transition-opacity duration-500", className)}
      data-animation-duration={String(visual.animationDurationSeconds)}
      data-bpm={String(visual.bpm)}
      data-palette={visual.paletteKey}
      data-source={visual.source}
      data-testid="feed-mood-backdrop"
      style={rootStyle}
    >
      <div className="absolute inset-[-18%] mix-blend-screen blur-2xl" style={orbitStyle} />
      <div
        className="absolute inset-x-[-18%] bottom-[-32%] h-2/3 rounded-full blur-3xl"
        style={glowStyle}
      />
      <div
        className="absolute left-[12%] top-[12%] h-28 w-28 rounded-full blur-3xl md:h-40 md:w-40"
        style={accentStyle}
      />
    </div>
  );
}
