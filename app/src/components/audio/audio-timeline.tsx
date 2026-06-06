import { cn } from "@/lib/utils";

type AudioTimelineProps = {
  className?: string;
  disabled?: boolean;
  duration: number;
  onSeek: (value: number) => void;
  progress: number;
  textClassName?: string;
};

export function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const roundedSeconds = Math.floor(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = String(roundedSeconds % 60).padStart(2, "0");

  return `${minutes}:${remainingSeconds}`;
}

export function AudioTimeline({
  className,
  disabled = false,
  duration,
  onSeek,
  progress,
  textClassName,
}: AudioTimelineProps) {
  const safeDuration = Math.max(duration, 1);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className={cn("w-9 text-right text-[11px] tabular-nums", textClassName)}>
        {formatAudioTime(progress)}
      </span>
      <input
        aria-label="Position de lecture"
        className="h-1.5 min-w-0 flex-1 accent-accent"
        disabled={disabled}
        max={safeDuration}
        min={0}
        onChange={(event) => onSeek(Number(event.currentTarget.value))}
        step="0.1"
        type="range"
        value={Math.min(progress, safeDuration)}
      />
      <span className={cn("w-9 text-[11px] tabular-nums", textClassName)}>
        {formatAudioTime(duration)}
      </span>
    </div>
  );
}
