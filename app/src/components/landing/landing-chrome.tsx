"use client";

import { SignInButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PAGE_PATHS } from "@/lib/paths";

type LandingChromeProps = {
  soundOn: boolean;
  onToggleSound: () => void;
  onBackToChoice: () => void;
};

const formatParisTime = () =>
  new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(new Date());

/**
 * Horloge locale Paris affichee dans le bandeau superieur.
 */
function ParisClock() {
  const [time, setTime] = useState(() =>
    typeof window === "undefined" ? "" : formatParisTime(),
  );

  useEffect(() => {
    const interval = window.setInterval(() => setTime(formatParisTime()), 15_000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <span suppressHydrationWarning>
      Paris, FR {time}
    </span>
  );
}

/**
 * Chrome DOM au-dessus de la grille : logo, tagline, horloge, auth,
 * navigation basse (catalogue/rush/pricing), toggles vue et son.
 * @param props.soundOn Etat du son.
 * @param props.onToggleSound Toggle du son global.
 * @param props.onBackToChoice Retour vers l'ecran de choix.
 */
export function LandingChrome({ soundOn, onToggleSound, onBackToChoice }: LandingChromeProps) {
  const { isSignedIn } = useUser();

  const pill =
    "pointer-events-auto border border-white/15 bg-black/40 backdrop-blur px-4 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-white/80 transition hover:border-white/40 hover:text-white";

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col justify-between">
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <button
          className="pointer-events-auto font-mono text-sm font-bold uppercase tracking-[0.2em] text-white transition hover:text-[#B892FF]"
          onClick={onBackToChoice}
          type="button"
        >
          Universe®
        </button>

        <div className="hidden flex-col items-center gap-1 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-white/50 md:flex">
          <span>La marketplace FR des beats — catalogue, licences & rush</span>
          <ParisClock />
        </div>

        <div className="flex items-center gap-2">
          {isSignedIn ? (
            <Link className={pill} href={PAGE_PATHS.account.dashboard.getHref()}>
              Mon compte
            </Link>
          ) : (
            <SignInButton mode="modal">
              <button className={pill} type="button">
                Connexion
              </button>
            </SignInButton>
          )}
        </div>
      </div>

      <div className="flex items-end justify-between gap-4 px-5 pb-5">
        <Link className={pill} href={PAGE_PATHS.beats.catalog.getHref()} title="Vue liste classique">
          ≡ Liste
        </Link>

        <nav className="pointer-events-auto flex items-center overflow-hidden rounded-full border border-white/15 bg-black/40 font-mono text-[11px] uppercase tracking-[0.25em] backdrop-blur">
          <span className="bg-white px-4 py-2 font-semibold text-black">Catalogue</span>
          <Link
            className="px-4 py-2 text-white/70 transition hover:bg-white/10 hover:text-white"
            href={PAGE_PATHS.rush.getHref()}
          >
            Rush
          </Link>
          <Link
            className="px-4 py-2 text-white/70 transition hover:bg-white/10 hover:text-white"
            href={PAGE_PATHS.pricing.getHref()}
          >
            Pricing
          </Link>
        </nav>

        <button className={pill} onClick={onToggleSound} type="button">
          Son [{soundOn ? "on" : "off"}]
        </button>
      </div>
    </div>
  );
}
