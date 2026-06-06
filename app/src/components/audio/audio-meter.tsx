import { cn } from "@/lib/utils";

type AudioMeterProps = {
  barCount?: number;
  className?: string;
  isActive?: boolean;
  tone?: "default" | "inverse" | "accent";
};

export function AudioMeter({
  barCount = 5,
  className,
  isActive = false,
  tone = "default",
}: AudioMeterProps) {
  const toneClass =
    tone === "inverse"
      ? "bg-white"
      : tone === "accent"
        ? "bg-accent"
        : "bg-primary";

  return (
    <div aria-hidden="true" className={cn("flex h-8 items-end gap-1", className)}>
      {Array.from({ length: barCount }, (_, bar) => (
        <span
          className={cn(
            "block w-1 rounded-full transition-all",
            toneClass,
            isActive ? "animate-pulse" : "opacity-45",
          )}
          key={bar}
          style={{
            animationDelay: `${bar * 110}ms`,
            height: `${10 + ((bar * 7) % 18)}px`,
          }}
        />
      ))}
    </div>
  );
}
