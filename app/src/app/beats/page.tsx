import Link from "next/link";

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

function formatPrice(priceAmount: number | null, currency: string, isFree: boolean) {
  if (isFree || priceAmount === 0) {
    return "Gratuit";
  }

  if (priceAmount === null) {
    return "Prix a definir";
  }

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
  }).format(priceAmount);
}

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
      <div className="flex flex-col gap-6 border-b border-black/10 pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-black/45">
            Catalogue V1
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-black">
            Instrumentales publiees
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-black/65">
            Les beats publics de la marketplace, branches aux premiers modeles
            publication, profil vendeur et assets.
          </p>
        </div>
        <Link
          className="inline-flex h-11 items-center justify-center rounded-full bg-black px-5 text-sm font-medium text-white"
          href="/account-test"
        >
          Tester mon compte
        </Link>
      </div>

      <BeatUploadTester />

      <form className="mt-6 grid gap-3 md:grid-cols-[1fr_180px_auto]" action="/beats">
        <input
          className="h-11 rounded-lg border border-black/15 px-4 text-sm outline-none focus:border-black"
          defaultValue={params.search ?? ""}
          name="search"
          placeholder="Rechercher par titre, description ou tag"
        />
        <input
          className="h-11 rounded-lg border border-black/15 px-4 text-sm outline-none focus:border-black"
          defaultValue={params.genre ?? ""}
          name="genre"
          placeholder="Style"
        />
        <button
          className="h-11 rounded-full border border-black bg-black px-5 text-sm font-medium text-white"
          type="submit"
        >
          Filtrer
        </button>
      </form>

      {beats.length === 0 ? (
        <div className="mt-10 border border-dashed border-black/20 p-8">
          <h2 className="text-xl font-semibold text-black">Aucune instrumentale publiee</h2>
          <p className="mt-2 text-sm leading-6 text-black/60">
            Cree une publication via l API <code>/api/beats</code>, avec
            <code> publish: true</code>, pour alimenter ce catalogue.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {beats.map((beat) => {
            const thumbnail = beat.assets.find((asset) => asset.role === "IMAGE_THUMBNAIL");

            return (
              <article key={beat.id} className="border border-black/10 bg-white">
                <Link href={`/beats/${beat.slug}`}>
                  <div className="aspect-video bg-black/[0.04]">
                    {thumbnail?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt=""
                        className="h-full w-full object-cover"
                        src={thumbnail.url}
                      />
                    ) : null}
                  </div>
                  <div className="space-y-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-lg font-semibold text-black">{beat.title}</h2>
                      <p className="shrink-0 text-sm font-semibold text-black">
                        {formatPrice(beat.priceAmount, beat.currency, beat.isFree)}
                      </p>
                    </div>
                    <p className="line-clamp-2 text-sm leading-6 text-black/60">
                      {beat.description ?? "Sans description."}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-black/50">
                      {beat.primaryGenre ? <span>{beat.primaryGenre}</span> : null}
                      {beat.seller.slug ? <span>par {beat.seller.displayName}</span> : null}
                    </div>
                  </div>
                </Link>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
