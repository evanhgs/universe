"use client";

import { useEffect, useMemo, useState } from "react";

import { coverDataUrl } from "./cover-art";
import type { LandingSoundManager } from "./sound";
import type { LandingBeat } from "./types";

type ChoiceSide = "catalog" | "rush";

type LandingChoiceProps = {
  beats: LandingBeat[];
  totalBeats: number;
  sound: LandingSoundManager;
  onPick: (side: ChoiceSide) => void;
};

/**
 * Ecran de choix immersif : deux moities Catalogue / Rush.
 * Le survol agrandit un cote (~70/30), le clic entre dans l'experience.
 * @param props.beats Beats pour les fonds animes.
 * @param props.totalBeats Nombre total de beats publies.
 * @param props.sound Gestionnaire de sons UI.
 * @param props.onPick Callback avec le cote choisi.
 */
export function LandingChoice({ beats, totalBeats, sound, onPick }: LandingChoiceProps) {
  const [hovered, setHovered] = useState<ChoiceSide | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);

  const marqueeTitles = useMemo(
    () => beats.slice(0, 28).map((beat) => beat.title.toUpperCase()),
    [beats],
  );

  useEffect(() => {
    // Les data URLs necessitent le DOM : generation apres montage, hors frame de rendu.
    const frame = requestAnimationFrame(() => {
      setThumbs(beats.slice(0, 18).map((beat) => coverDataUrl(beat, 96)));
    });

    return () => cancelAnimationFrame(frame);
  }, [beats]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "c" || event.key === "C") {
        onPick("catalog");
      }

      if (event.key === "r" || event.key === "R") {
        onPick("rush");
      }
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [onPick]);

  const sideClass = (side: ChoiceSide) => {
    const base =
      "landing-fade-in group relative flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden text-left transition-all duration-500 ease-out";
    const grow =
      hovered === side ? "md:flex-[1.5] flex-[1.5]" : hovered ? "md:flex-[1] flex-[1]" : "";
    const dim = hovered && hovered !== side ? "opacity-50 saturate-50" : "opacity-100";

    return `${base} ${grow} ${dim}`;
  };

  return (
    <div className="landing-screen fixed inset-0 z-40 flex flex-col bg-[#060609] text-white">
      <div className="landing-scanlines pointer-events-none absolute inset-0 z-10" aria-hidden />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-6 pt-6 font-mono text-[11px] uppercase tracking-[0.25em] text-white/45">
        <span>Universe®</span>
        <span className="hidden sm:block">Choisis ton expérience</span>
        <span>[C] / [R]</span>
      </div>

      <div className="flex flex-1 flex-col md:flex-row">
        <button
          className={sideClass("catalog")}
          onClick={() => {
            sound.blip(520, 0.08, 0.1);
            onPick("catalog");
          }}
          onMouseEnter={() => {
            setHovered("catalog");
            sound.hoverBlip();
          }}
          onMouseLeave={() => setHovered(null)}
          type="button"
        >
          <div
            aria-hidden
            className="landing-drift pointer-events-none absolute inset-[-12%] grid grid-cols-6 gap-3 opacity-30 transition-opacity duration-500 group-hover:opacity-45"
          >
            {Array.from({ length: 24 }, (_, index) => {
              const thumb = thumbs[index % Math.max(thumbs.length, 1)];

              return thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt=""
                  className="aspect-square w-full object-cover"
                  draggable={false}
                  key={index}
                  src={thumb}
                />
              ) : (
                <div className="aspect-square w-full bg-white/5" key={index} />
              );
            })}
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#060609] via-[#060609]/55 to-[#060609]/25" />

          <div className="relative z-10 flex flex-col items-center gap-3 px-6 text-center">
            <span className="font-mono text-[11px] uppercase tracking-[0.4em] text-white/50">
              01 — Explorer
            </span>
            <span className="text-[clamp(2.4rem,7vw,6rem)] leading-none font-black tracking-tight uppercase">
              Catalogue
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/60">
              {totalBeats} beats — grille infinie
            </span>
            <span className="mt-4 border border-white/25 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.35em] text-white/80 transition group-hover:border-white group-hover:bg-white group-hover:text-black">
              Entrer →
            </span>
          </div>
        </button>

        <div aria-hidden className="z-10 h-px w-full bg-white/15 md:h-auto md:w-px" />

        <button
          className={sideClass("rush")}
          onClick={() => {
            sound.blip(660, 0.08, 0.1);
            onPick("rush");
          }}
          onMouseEnter={() => {
            setHovered("rush");
            sound.hoverBlip();
          }}
          onMouseLeave={() => setHovered(null)}
          type="button"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex justify-around opacity-25 transition-opacity duration-500 group-hover:opacity-40"
          >
            {[0, 1, 2].map((column) => (
              <div
                className={`landing-marquee flex flex-col gap-6 font-mono text-xs uppercase tracking-[0.3em] whitespace-nowrap text-white ${
                  column === 1 ? "landing-marquee-slow" : ""
                }`}
                key={column}
              >
                {[...marqueeTitles, ...marqueeTitles].map((title, index) => (
                  <span key={index}>{title}</span>
                ))}
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#12063a]/70 via-[#060609]/60 to-[#060609]" />

          <div className="relative z-10 flex flex-col items-center gap-3 px-6 text-center">
            <span className="font-mono text-[11px] uppercase tracking-[0.4em] text-white/50">
              02 — Écouter
            </span>
            <span className="text-[clamp(2.4rem,7vw,6rem)] leading-none font-black tracking-tight uppercase">
              Rush
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-white/60">
              Le feed rapide — un beat plein écran
            </span>
            <div aria-hidden className="mt-2 flex h-6 items-end gap-1">
              {Array.from({ length: 12 }, (_, index) => (
                <span
                  className="landing-eq-bar w-1 bg-[#B892FF]"
                  key={index}
                  style={{ animationDelay: `${index * 90}ms` }}
                />
              ))}
            </div>
            <span className="mt-2 border border-white/25 px-5 py-2 font-mono text-[11px] uppercase tracking-[0.35em] text-white/80 transition group-hover:border-white group-hover:bg-white group-hover:text-black">
              Scroller →
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}
