"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { PAGE_PATHS } from "@/lib/paths";

import { BeatGrid } from "./beat-grid";
import { LandingChoice } from "./landing-choice";
import { LandingChrome } from "./landing-chrome";
import { LandingLoader } from "./landing-loader";
import { LandingSoundManager, PreviewPlayer } from "./sound";
import type { LandingBeat } from "./types";

const SOUND_STORAGE_KEY = "universe.landing.sound";

let enteredThisPageLoad = false;

type Phase = "loader" | "choice" | "grid" | "leaving";

/**
 * Lit la vue demandee en query string (`?vue=grille` saute l'ecran de choix).
 * @returns Phase cible ou null si aucune vue explicite.
 */
function requestedPhaseFromLocation(): Phase | null {
  const vue = new URLSearchParams(window.location.search).get("vue");

  return vue === "grille" ? "grid" : null;
}

type LandingExperienceProps = {
  beats: LandingBeat[];
  totalBeats: number;
};

/**
 * Orchestrateur de la landing immersive : loader -> choix -> grille/rush.
 * Gere la preference son, les transitions et les instances audio partagees.
 * @param props.beats Beats presignes fournis par le serveur.
 * @param props.totalBeats Nombre total de beats publies.
 */
export function LandingExperience({ beats, totalBeats }: LandingExperienceProps) {
  const [phase, setPhase] = useState<Phase>("loader");
  const [soundOn, setSoundOn] = useState(false);
  const [sound] = useState(() => new LandingSoundManager());
  const [preview] = useState(() => new PreviewPlayer());
  const router = useRouter();

  useEffect(() => {
    router.prefetch(PAGE_PATHS.rush.getHref());

    return () => {
      preview.release();
    };
  }, [preview, router]);

  // Loader deja vu pendant ce chargement de page (navigation interne depuis
  // Rush par exemple) : on saute directement au choix, ou a la grille si la
  // navigation demande explicitement `?vue=grille`.
  useEffect(() => {
    if (!enteredThisPageLoad) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const soundPref = window.localStorage.getItem(SOUND_STORAGE_KEY) === "on";

      setSoundOn(soundPref);

      if (soundPref) {
        sound.setEnabled(true);
      }

      setPhase(requestedPhaseFromLocation() ?? "choice");
    });

    return () => cancelAnimationFrame(frame);
  }, [sound]);

  const handleEnter = useCallback(
    (withSound: boolean) => {
      sound.unlock(withSound);
      setSoundOn(withSound);
      window.localStorage.setItem(SOUND_STORAGE_KEY, withSound ? "on" : "off");
      enteredThisPageLoad = true;

      if (withSound) {
        sound.enterSequence();
      }

      setPhase(requestedPhaseFromLocation() ?? "choice");
    },
    [sound],
  );

  const handlePick = useCallback(
    (side: "catalog" | "rush") => {
      if (side === "catalog") {
        setPhase("grid");
        return;
      }

      setPhase("leaving");
      preview.stop();
      window.setTimeout(() => {
        router.push(PAGE_PATHS.rush.getHref());
      }, 320);
    },
    [preview, router],
  );

  const handleToggleSound = useCallback(() => {
    setSoundOn((current) => {
      const next = !current;

      sound.setEnabled(next);
      window.localStorage.setItem(SOUND_STORAGE_KEY, next ? "on" : "off");

      if (!next) {
        preview.stop();
      }

      return next;
    });
  }, [preview, sound]);

  const handleBackToChoice = useCallback(() => {
    preview.stop();
    sound.blip(430, 0.06, 0.08);
    setPhase("choice");
  }, [preview, sound]);

  return (
    <main className="fixed inset-0 overflow-hidden bg-[#060609]">
      {phase === "loader" ? <LandingLoader beats={beats} onEnter={handleEnter} /> : null}

      {phase === "choice" || phase === "leaving" ? (
        <div
          className={`h-full w-full transition-opacity duration-300 ${
            phase === "leaving" ? "opacity-0" : "opacity-100"
          }`}
        >
          <LandingChoice
            beats={beats}
            onPick={handlePick}
            sound={sound}
            totalBeats={totalBeats}
          />
        </div>
      ) : null}

      {phase === "grid" ? (
        <div className="landing-fade-in relative h-full w-full">
          <BeatGrid beats={beats} preview={preview} sound={sound} soundEnabled={soundOn} />
          <LandingChrome
            onBackToChoice={handleBackToChoice}
            onToggleSound={handleToggleSound}
            soundOn={soundOn}
          />
        </div>
      ) : null}
    </main>
  );
}
