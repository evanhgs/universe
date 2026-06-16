"use client";

import Link from "next/link";
import { type SyntheticEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type BeatAsset = {
  id: string;
  role: string;
  url: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

type CatalogBeat = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  priceAmount: number | null;
  currency: string;
  primaryGenre: string | null;
  isFree: boolean;
  seller: {
    slug: string | null;
    displayName: string | null;
  };
  assets: BeatAsset[];
};

type CatalogPage = {
  items: CatalogBeat[];
  count?: number;
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

type BeatsCatalogClientProps = {
  initialPage: CatalogPage;
  initialFilters: {
    search?: string;
    genre?: string;
    sellerSlug?: string;
    limit: number;
    page: number;
  };
};

const MARKETPLACE_LIMIT_OPTIONS = [20, 35, 50] as const;

function formatPriceHT(priceAmount: number | null, currency: string, isFree: boolean) {
  if (isFree || priceAmount === 0) {
    return "Gratuit";
  }

  if (priceAmount === null) {
    return "Prix a definir";
  }

  return `A partir de ${new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
  }).format(priceAmount)} HT`;
}

function buildCatalogParams(filters: {
  search?: string;
  genre?: string;
  sellerSlug?: string;
  limit: number;
  page: number;
}) {
  const params = new URLSearchParams();
  const search = filters.search?.trim();
  const genre = filters.genre?.trim();
  const sellerSlug = filters.sellerSlug?.trim();

  if (search) params.set("search", search);
  if (genre) params.set("genre", genre);
  if (sellerSlug) params.set("sellerSlug", sellerSlug);
  params.set("limit", String(filters.limit));
  if (filters.page > 1) params.set("page", String(filters.page));

  return params;
}

/**
 * Catalogue client: filtre et pagine via /api/beats sans navigation complete.
 */
export function BeatsCatalogClient({
  initialPage,
  initialFilters,
}: BeatsCatalogClientProps) {
  const [search, setSearch] = useState(initialFilters.search ?? "");
  const [genre, setGenre] = useState(initialFilters.genre ?? "");
  const [limit, setLimit] = useState(initialFilters.limit);
  const [page, setPage] = useState(initialPage);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseFilters = useMemo(
    () => ({
      sellerSlug: initialFilters.sellerSlug,
      limit,
    }),
    [initialFilters.sellerSlug, limit],
  );

  const loadCatalog = useCallback(
    async (nextFilters: {
      search?: string;
      genre?: string;
      sellerSlug?: string;
      limit: number;
      page: number;
    }) => {
      const params = buildCatalogParams(nextFilters);
      const query = params.toString();

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/beats?${query}`, {
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("catalog_load_failed");
        }

        const nextPage = (await response.json()) as CatalogPage;
        const resolvedParams = buildCatalogParams({
          ...nextFilters,
          page: nextPage.page,
        });
        const resolvedQuery = resolvedParams.toString();

        setPage(nextPage);
        window.history.pushState(null, "", resolvedQuery ? `/beats?${resolvedQuery}` : "/beats");
      } catch {
        setError("Impossible de charger le catalogue pour le moment.");
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    function onGlobalSearch(event: Event) {
      const detail = (event as CustomEvent<{ search?: string }>).detail;
      const nextSearch = detail?.search ?? "";

      setSearch(nextSearch);
      void loadCatalog({
        ...baseFilters,
        search: nextSearch,
        genre,
        page: 1,
      });
    }

    window.addEventListener("beats:catalog-search", onGlobalSearch);

    return () => {
      window.removeEventListener("beats:catalog-search", onGlobalSearch);
    };
  }, [baseFilters, genre, loadCatalog]);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadCatalog({
      ...baseFilters,
      search,
      genre,
      page: 1,
    });
  }

  function onPageChange(nextPage: number) {
    void loadCatalog({
      ...baseFilters,
      search,
      genre,
      page: nextPage,
    });
  }

  return (
    <>
      <form
        action="/beats"
        className="mt-6 grid gap-3 md:grid-cols-[1fr_180px_140px_auto]"
        onSubmit={onSubmit}
      >
        {initialFilters.sellerSlug ? (
          <input name="sellerSlug" type="hidden" value={initialFilters.sellerSlug} />
        ) : null}
        <Input
          name="search"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher par titre, description ou tag"
          value={search}
        />
        <Input
          name="genre"
          onChange={(event) => setGenre(event.target.value)}
          placeholder="Style"
          value={genre}
        />
        <Select onValueChange={(value) => setLimit(Number(value))} value={String(limit)}>
          <SelectTrigger aria-label="Resultats par page" className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MARKETPLACE_LIMIT_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button disabled={isLoading} size="lg" type="submit">
          Filtrer
        </Button>
      </form>

      <section aria-busy={isLoading} className={isLoading ? "opacity-60" : undefined}>
        {error ? (
          <p className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {page.items.length === 0 ? (
          <div className="mt-10 rounded-lg border border-dashed border-border p-8">
            <h2 className="text-xl font-semibold text-foreground">{"Aucune instru publiée"}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {"C'est le désert musical ici..."}
            </p>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {page.items.map((beat) => {
              const thumbnail = beat.assets.find((asset) => asset.role === "IMAGE_THUMBNAIL");

              return (
                <Card className="overflow-hidden" key={beat.id}>
                  <Link href={`/beats/${beat.slug}`}>
                    <div className="aspect-video bg-muted">
                      {thumbnail?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          alt=""
                          className="h-full w-full object-cover"
                          src={thumbnail.url}
                        />
                      ) : null}
                    </div>
                    <CardContent className="space-y-3 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-lg font-semibold text-foreground">{beat.title}</h2>
                        <p className="shrink-0 text-sm font-semibold text-foreground">
                          {formatPriceHT(beat.priceAmount, beat.currency, beat.isFree)}
                        </p>
                      </div>
                      <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {beat.description ?? "Sans description."}
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {beat.primaryGenre ? <span>{beat.primaryGenre}</span> : null}
                        {beat.seller.slug ? <span>par {beat.seller.displayName}</span> : null}
                      </div>
                      <span className="inline-flex h-10 items-center justify-center rounded-full border border-input px-4 text-sm font-medium text-foreground">
                        Voir licences
                      </span>
                    </CardContent>
                  </Link>
                </Card>
              );
            })}
          </div>
        )}

        <nav className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <p className="text-sm text-muted-foreground">
            Page {page.page} / {page.totalPages}
          </p>
          <p className="text-sm text-muted-foreground">
            {page.totalItems} résultats trouvés
          </p>
          <div className="flex gap-2">
            <Button
              disabled={!page.hasPreviousPage || isLoading}
              onClick={() => onPageChange(Math.max(page.page - 1, 1))}
              type="button"
              variant="outline"
            >
              {"Précédent"}
            </Button>
            <Button
              disabled={!page.hasNextPage || isLoading}
              onClick={() => onPageChange(page.page + 1)}
              type="button"
              variant="outline"
            >
              {"Suivant"}
            </Button>
          </div>
        </nav>
      </section>
    </>
  );
}
