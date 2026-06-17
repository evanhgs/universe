"use client";

import { Search } from "lucide-react";
import { useId } from "react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PAGE_PATHS } from "@/lib/paths";

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
  const pathname = usePathname();

  return (
    <form
      action={PAGE_PATHS.beats.catalog.getHref()}
      aria-label="Recherche globale"
      className="relative w-full"
      method="get"
      onSubmit={(event) => {
        if (pathname !== PAGE_PATHS.beats.catalog.getHref()) {
          return;
        }

        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const search = String(formData.get("search") ?? "");

        window.dispatchEvent(
          new CustomEvent("beats:catalog-search", {
            detail: { search },
          }),
        );
      }}
      role="search"
    >
      <label className="sr-only" htmlFor={inputId}>
        Rechercher sur Universe
      </label>
      <input name="scope" type="hidden" value={scope} />
      <Input
        className="rounded-full bg-card px-11 pr-4 shadow-sm placeholder:text-muted-foreground focus-visible:shadow-md"
        defaultValue={defaultQuery}
        id={inputId}
        name="search"
        placeholder="Rechercher tracks, artistes, styles..."
        type="search"
      />
      <Button
        aria-label="Lancer la recherche"
        className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        size="icon-sm"
        type="submit"
        variant="ghost"
      >
        <Search aria-hidden="true" className="h-4 w-4" />
      </Button>
    </form>
  );
}
