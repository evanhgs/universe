import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listPublishedBeatsPayload } from "@/server/beats/beat.service";
import { BeatUploadTester } from "./beat-upload-tester";

type BeatsPageProps = {
  searchParams: Promise<{
    search?: string;
    genre?: string;
    sellerSlug?: string;
  }>;
};

export const dynamic = "force-dynamic";

/**
 * Formate le prix hors taxe affiche sur les cartes catalogue.
 * @param priceAmount Prix decimal nullable.
 * @param currency Code devise ISO.
 * @param isFree Indique si le beat est gratuit.
 */
function formatPriceHT(priceAmount: number | null, currency: string, isFree: boolean) {
  if (isFree || priceAmount === 0) {
    return "Gratuit";
  }

  if (priceAmount === null) {
    return "Prix a definir";
  }

  return `${new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
  }).format(priceAmount)} HT`;
}

/**
 * Page catalogue serveur affichant les beats publics et le formulaire d'upload test.
 * @param props.searchParams Filtres search, genre et sellerSlug fournis par Next.js.
 * @returns Markup du catalogue beats.
 */
export default async function BeatsPage({ searchParams }: BeatsPageProps) {
  const params = await searchParams;
  const beats = await listPublishedBeatsPayload({
    search: params.search,
    genre: params.genre,
    sellerSlug: params.sellerSlug,
    sort: "newest",
    limit: 48,
  });

  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-6xl px-6 py-10">
      <div className="flex flex-col gap-6 border-b border-border pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase text-muted-foreground">
            Catalogue V1
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
            Instrumentales publiees
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
            Les beats publics de la marketplace, branches aux premiers modeles
            publication, profil vendeur et assets.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/account-test">Tester mon compte</Link>
        </Button>
      </div>

      <BeatUploadTester />

      <form className="mt-6 grid gap-3 md:grid-cols-[1fr_180px_auto]" action="/beats">
        <Input
          defaultValue={params.search ?? ""}
          name="search"
          placeholder="Rechercher par titre, description ou tag"
        />
        <Input
          defaultValue={params.genre ?? ""}
          name="genre"
          placeholder="Style"
        />
        <Button size="lg" type="submit">
          Filtrer
        </Button>
      </form>

      {beats.length === 0 ? (
        <div className="mt-10 rounded-lg border border-dashed border-border p-8">
          <h2 className="text-xl font-semibold text-foreground">Aucune instrumentale publiee</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Cree une publication via l API <code>/api/beats</code>, avec
            <code> publish: true</code>, pour alimenter ce catalogue.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {beats.map((beat) => {
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
                        A partir de {formatPriceHT(beat.priceAmount, beat.currency, beat.isFree)}
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
    </main>
  );
}
