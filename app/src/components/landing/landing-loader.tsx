"use client";

import { useEffect, useRef, useState } from "react";

import { coverDataUrl } from "./cover-art";
import type { LandingBeat } from "./types";

const BOOT_LINES = [
  "INIT AUDIO ENGINE",
  "CHARGEMENT DU CATALOGUE",
  "GENERATION DES ARTWORKS",
  "LIAISON DU FEED RUSH",
  "CALIBRATION DE LA GRILLE",
];

const MIN_DURATION_MS = 1600;

type LandingLoaderProps = {
  beats: LandingBeat[];
  onEnter: (soundOn: boolean) => void;
};

/**
 * Ecran de chargement plein ecran : titre, compteur reel de prechargement
 * et entree avec ou sans son (le clic debloque l'audio navigateur).
 * @param props.beats Beats utilises pour prechauffer les artworks.
 * @param props.onEnter Callback d'entree avec la preference son.
 */
export function LandingLoader({ beats, onEnter }: LandingLoaderProps) {
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [bootLine, setBootLine] = useState(0);
  const doneRef = useRef(0);
  const totalRef = useRef(1);
  const shownRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    const startedAt = performance.now();
    const warmup = beats.slice(0, 24);

    totalRef.current = warmup.length + 1;
    doneRef.current = 0;

    // Prechauffe les artworks generatifs par petits lots hors frame critique.
    let cursor = 0;
    const warmChunk = () => {
      if (disposed) {
        return;
      }

      const end = Math.min(cursor + 4, warmup.length);

      for (; cursor < end; cursor++) {
        coverDataUrl(warmup[cursor], 96);
        doneRef.current += 1;
      }

      if (cursor < warmup.length) {
        window.setTimeout(warmChunk, 30);
      }
    };

    warmChunk();

    void document.fonts?.ready.then(() => {
      if (!disposed) {
        doneRef.current += 1;
      }
    });

    let frame = 0;
    const tick = () => {
      if (disposed) {
        return;
      }

      const elapsed = performance.now() - startedAt;
      const timeProgress = Math.min(1, elapsed / MIN_DURATION_MS);
      const taskProgress = doneRef.current / totalRef.current;
      const target = Math.min(timeProgress, Math.max(taskProgress, timeProgress * 0.72)) * 100;

      shownRef.current += (target - shownRef.current) * 0.22;

      if (shownRef.current >= 98.4 && timeProgress >= 1) {
        setProgress(100);
        setReady(true);
        return;
      }

      setProgress(shownRef.current);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    const bootTimer = window.setInterval(() => {
      setBootLine((line) => (line + 1) % BOOT_LINES.length);
    }, 420);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.clearInterval(bootTimer);
    };
  }, [beats]);

  const shown = Math.min(100, Math.floor(progress));

  return (
    <div className="landing-screen fixed inset-0 z-50 flex flex-col bg-[#060609] text-white">
      <div className="landing-scanlines pointer-events-none absolute inset-0" aria-hidden />

      <div className="flex items-start justify-between px-6 pt-6 font-mono text-[11px] uppercase tracking-[0.25em] text-white/45">
        <span>Universe — Système</span>
        <span aria-hidden className="hidden sm:block">
          {ready ? "PRÊT" : BOOT_LINES[bootLine]}
        </span>
        <span>FR / PARIS</span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1
          className="landing-glitch text-[clamp(3rem,10vw,8.5rem)] leading-none font-black tracking-tighter uppercase"
          data-text="Universe"
        >
          Universe
        </h1>
        <p className="mt-4 font-mono text-[clamp(0.7rem,1.6vw,1rem)] uppercase tracking-[0.6em] text-white/60">
          Beat marketplace
        </p>

        <div className="mt-14 flex h-16 items-center justify-center">
          {ready ? (
            <div className="landing-fade-up flex flex-col items-center gap-4 sm:flex-row">
              <button
                className="border border-white bg-white px-8 py-3 font-mono text-xs font-semibold uppercase tracking-[0.35em] text-black transition hover:bg-transparent hover:text-white"
                onClick={() => onEnter(true)}
                type="button"
              >
                Entrer — Son on
              </button>
              <button
                className="border border-white/30 px-8 py-3 font-mono text-xs uppercase tracking-[0.35em] text-white/70 transition hover:border-white hover:text-white"
                onClick={() => onEnter(false)}
                type="button"
              >
                Son off
              </button>
            </div>
          ) : (
            <span className="font-mono text-4xl font-medium tabular-nums text-white/85 sm:text-5xl">
              {shown}
              <span className="text-white/40">%</span>
            </span>
          )}
        </div>
      </div>

      <div className="px-6 pb-6">
        <div className="h-px w-full bg-white/10">
          <div
            className="h-px bg-white transition-[width] duration-150 ease-out"
            style={{ width: `${shown}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.25em] text-white/45">
          <span>{beats.length} beats indexés</span>
          <span>{ready ? "Cliquer pour entrer" : "Chargement"}</span>
        </div>
      </div>
    </div>
  );
}
