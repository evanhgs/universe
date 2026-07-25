"use client";

import { SignInButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PAGE_PATHS } from "@/lib/paths";

const SHORTCUTS: Array<[string, string]> = [
  ["↓ / ↑ / molette", "Beat suivant / précédent"],
  ["Espace / Entrée", "Beat suivant"],
  ["K", "Play / pause"],
  ["J / L", "Reculer / avancer de 5s"],
];

/**
 * Chrome immersif de la page Rush, aligne sur la landing phantom-style :
 * retour, logo, auth, navigation basse et panneau des raccourcis clavier.
 */
export function RushChrome() {
  const { isSignedIn } = useUser();
  const router = useRouter();
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "?") {
        setShowShortcuts((current) => !current);
      }

      if (event.key === "Escape") {
        setShowShortcuts(false);
      }
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pill =
    "pointer-events-auto border border-white/15 bg-black/50 backdrop-blur px-4 py-2 font-mono text-[11px] uppercase tracking-[0.25em] text-white/80 transition hover:border-white/40 hover:text-white";

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex flex-col justify-between">
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <div className="flex items-center gap-2">
          <button
            aria-label="Revenir en arrière"
            className={pill}
            onClick={() => router.push(PAGE_PATHS.home.getHref())}
            type="button"
          >
            ← Retour
          </button>
          <Link
            className="pointer-events-auto hidden font-mono text-sm font-bold uppercase tracking-[0.2em] text-white transition hover:text-[#B892FF] sm:block"
            href={PAGE_PATHS.home.getHref()}
          >
            Universe®
          </Link>
        </div>

        <span className="hidden pt-2 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-white/50 md:block">
          Rush — le feed rapide, un beat plein écran
        </span>

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

        <nav className="pointer-events-auto flex items-center overflow-hidden rounded-full border border-white/15 bg-black/50 font-mono text-[11px] uppercase tracking-[0.25em] backdrop-blur">
          <Link
            className="px-4 py-2 text-white/70 transition hover:bg-white/10 hover:text-white"
            href={`${PAGE_PATHS.home.getHref()}?vue=grille`}
          >
            Catalogue
          </Link>
          <span className="bg-white px-4 py-2 font-semibold text-black">Rush</span>
          <Link
            className="px-4 py-2 text-white/70 transition hover:bg-white/10 hover:text-white"
            href={PAGE_PATHS.pricing.getHref()}
          >
            Pricing
          </Link>
        </nav>

        <button
          aria-expanded={showShortcuts}
          className={pill}
          onClick={() => setShowShortcuts((current) => !current)}
          type="button"
        >
          Raccourcis [?]
        </button>
      </div>

      {showShortcuts ? (
        <div className="pointer-events-auto absolute right-5 bottom-20 border border-white/15 bg-black/80 p-5 font-mono backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white">
            Raccourcis clavier
          </p>
          <ul className="mt-3 space-y-2">
            {SHORTCUTS.map(([keys, label]) => (
              <li className="flex items-baseline justify-between gap-6" key={keys}>
                <span className="text-[11px] uppercase tracking-[0.2em] text-[#B892FF]">{keys}</span>
                <span className="text-[11px] uppercase tracking-[0.15em] text-white/70">{label}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-white/40">
            [?] pour afficher / masquer
          </p>
        </div>
      ) : null}
    </div>
  );
}
