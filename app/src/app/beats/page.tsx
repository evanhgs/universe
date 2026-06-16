import Link from "next/link";

import { Button } from "@/components/ui/button";
import { MAIN_GENRES, type MainGenre } from "@/lib/beat-metadata";
import { listPublishedBeatsPayload } from "@/server/beats/beat.service";
import { BeatsCatalogClient } from "./beats-catalog-client";

type BeatsPageProps = {
  searchParams: Promise<{
    search?: string;
    genre?: string;
    sellerSlug?: string;
    limit?: string;
    page?: string;
  }>;
};

export const dynamic = "force-dynamic";
const MARKETPLACE_LIMIT_OPTIONS = [20, 35, 50] as const;

function parseMarketplaceLimit(value: string | undefined) {
  const limit = Number(value ?? MARKETPLACE_LIMIT_OPTIONS[0]);

  return MARKETPLACE_LIMIT_OPTIONS.find((option) => option === limit) ?? MARKETPLACE_LIMIT_OPTIONS[0];
}

function parsePage(value: string | undefined) {
  const page = Number(value ?? 1);

  return Number.isInteger(page) && page > 0 ? page : 1;
}


/**
 * Page catalogue serveur affichant les beats publics et le formulaire d'upload test.
 * @param props.searchParams Filtres search, genre et sellerSlug fournis par Next.js.
 * @returns Markup du catalogue beats.
 */
export default async function BeatsPage({ searchParams }: BeatsPageProps) {
  const params = await searchParams;
  const genreParam = params.genre?.trim().toUpperCase() as MainGenre | undefined;
  const genre = genreParam && MAIN_GENRES.includes(genreParam) ? genreParam : undefined;
  const limit = parseMarketplaceLimit(params.limit);
  const currentPage = parsePage(params.page);
  const beatPage = await listPublishedBeatsPayload({
    search: params.search,
    genre,
    sellerSlug: params.sellerSlug,
    sort: "newest",
    limit,
    page: currentPage,
  });

  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-6xl px-6 py-10">
      <div className="flex flex-col gap-6 border-b border-border pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase text-muted-foreground">
            {"Catalogues"}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
            {'Marketplace des beats publiés'}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
            {"Utilisez la barre de recherche pour cibler vos résultats, ou allez scroller un coup dans le feed !"}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/beats/upload">Uploader un beat</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/account-test">Tester mon compte</Link>
          </Button>
        </div>
      </div>


      <BeatsCatalogClient
        initialFilters={{
          search: params.search,
          genre: params.genre,
          sellerSlug: params.sellerSlug,
          limit,
          page: currentPage,
        }}
        initialPage={beatPage}
      />
    </main>
  );
}
