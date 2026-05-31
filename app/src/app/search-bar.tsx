"use client";

import { Search } from "lucide-react";
import { useId } from "react";

type SearchScope = "all" | "tracks" | "artists" | "beats" | "styles";

type SearchBarProps = {
  defaultQuery?: string;
  scope?: SearchScope;
};

/**
 * Barre de recherche globale du header.
 * Elle soumet vers le catalogue actuel, puis pourra etre branchee sur Typesense.
 */
export function SearchBar({ defaultQuery = "", scope = "all" }: SearchBarProps) {
  const inputId = useId();

  return (
    <form
      action="/beats"
      aria-label="Recherche globale"
      className="relative w-full"
      method="get"
      role="search"
    >
      <label className="sr-only" htmlFor={inputId}>
        Rechercher sur Universe
      </label>
      <input name="scope" type="hidden" value={scope} />
      <input
        className="h-11 w-full rounded-full border border-black/10 bg-white px-11 pr-4 text-sm text-black shadow-sm outline-none transition placeholder:text-black/40 focus:border-black/35 focus:shadow-md"
        defaultValue={defaultQuery}
        id={inputId}
        name="search"
        placeholder="Rechercher tracks, artistes, styles..."
        type="search"
      />
      <button
        aria-label="Lancer la recherche"
        className="absolute left-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-black/55 transition hover:bg-black/6 hover:text-black"
        type="submit"
      >
        <Search aria-hidden="true" className="h-4 w-4" />
      </button>
    </form>
  );
}
