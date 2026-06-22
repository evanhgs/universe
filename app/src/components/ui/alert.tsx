import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const alertVariants = cva(
  "pointer-events-none fixed left-1/2 top-4 z-50 w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 overflow-hidden rounded-[1.35rem] border px-5 py-3.5 pl-10 text-sm font-medium leading-6 shadow-[0_22px_70px_-28px_rgba(11,11,15,0.65)] outline-none backdrop-blur-2xl backdrop-saturate-150 motion-safe:animate-out motion-safe:fade-out motion-safe:zoom-out-95 motion-safe:slide-out-to-top-2 motion-safe:delay-[3000ms] motion-safe:duration-500 motion-safe:fill-mode-forwards sm:top-5 sm:w-full before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(180deg,rgba(255,255,255,0.52),rgba(255,255,255,0.08)_42%,rgba(255,255,255,0))] before:content-[''] after:absolute after:left-5 after:top-5 after:size-2.5 after:rounded-full after:shadow-[0_0_0_5px_rgba(255,255,255,0.55),0_0_22px_currentColor] after:content-[''] dark:shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9)] dark:before:bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.04)_46%,rgba(255,255,255,0))]",
  {
    defaultVariants: {
      variant: "default",
    },
    variants: {
      variant: {
        default:
          "border-white/60 bg-white/80 text-slate-950 ring-1 ring-black/5 after:bg-brand after:text-brand dark:border-white/10 dark:bg-zinc-950/80 dark:text-white dark:ring-white/10",
        success:
          "border-emerald-200/80 bg-emerald-50/90 text-emerald-950 ring-1 ring-emerald-700/10 after:bg-emerald-500 after:text-emerald-500 dark:border-emerald-300/20 dark:bg-emerald-950/80 dark:text-emerald-50 dark:ring-emerald-300/10",
        warning:
          "border-amber-200/80 bg-amber-50/90 text-amber-950 ring-1 ring-amber-700/10 after:bg-amber-400 after:text-amber-400 dark:border-amber-300/20 dark:bg-amber-950/80 dark:text-amber-50 dark:ring-amber-300/10",
        destructive:
          "border-rose-200/80 bg-rose-50/90 text-rose-950 ring-1 ring-rose-700/10 after:bg-rose-500 after:text-rose-500 dark:border-rose-300/20 dark:bg-rose-950/80 dark:text-rose-50 dark:ring-rose-300/10",
        muted:
          "border-white/60 bg-zinc-100/90 text-zinc-800 ring-1 ring-black/5 after:bg-zinc-400 after:text-zinc-400 dark:border-white/10 dark:bg-zinc-900/80 dark:text-zinc-100 dark:ring-white/10",
      },
    },
  },
);

export type AlertProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof alertVariants>;

export function Alert({ className, variant, ...props }: AlertProps) {
  return <div className={cn(alertVariants({ className, variant }))} {...props} />;
}
