import { Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type VolumeControlProps = {
  buttonClassName?: string;
  className?: string;
  isMuted: boolean;
  onMuteChange: (value: boolean) => void;
  onVolumeChange: (value: number) => void;
  textClassName?: string;
  volume: number;
};

export function VolumeControl({
  buttonClassName,
  className,
  isMuted,
  onMuteChange,
  onVolumeChange,
  textClassName,
  volume,
}: VolumeControlProps) {
  const effectiveVolume = isMuted ? 0 : volume;

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <Button
        aria-label={isMuted ? "Retablir le volume" : "Couper le volume"}
        className={buttonClassName}
        onClick={() => onMuteChange(!isMuted)}
        size="icon-sm"
        type="button"
        variant="outline"
      >
        {effectiveVolume === 0 ? <VolumeX /> : <Volume2 />}
      </Button>
      <input
        aria-label="Volume"
        className="h-1.5 w-28 accent-accent sm:w-36"
        max={1}
        min={0}
        onChange={(event) => onVolumeChange(Number(event.currentTarget.value))}
        step="0.01"
        type="range"
        value={effectiveVolume}
      />
      <span className={cn("text-xs tabular-nums text-muted-foreground", textClassName)}>
        {Math.round(effectiveVolume * 100)}%
      </span>
    </div>
  );
}
