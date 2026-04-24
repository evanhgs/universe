import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getBeatPayloadBySlug } from "@/server/beats/beat.service";

type BeatDetailPageProps = {
  params: Promise<{
    slug: string;
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

export default async function BeatDetailPage({ params }: BeatDetailPageProps) {
  const { slug } = await params;
  const { userId } = await auth();
  const beat = await getBeatPayloadBySlug(slug, userId ?? null);

  if (!beat) {
    notFound();
  }

  const audio = beat.assets.find((asset) => asset.role === "AUDIO_SOURCE");
  const thumbnail = beat.assets.find((asset) => asset.role === "IMAGE_THUMBNAIL");

  return (
    <main className="mx-auto grid min-h-[calc(100vh-73px)] w-full max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[1fr_360px]">
      <section>
        <Link className="text-sm font-medium text-black/55 hover:text-black" href="/beats">
          Retour au catalogue
        </Link>
        <div className="mt-6 aspect-video overflow-hidden border border-black/10 bg-black/[0.04]">
          {thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" className="h-full w-full object-cover" src={`/${thumbnail.objectKey}`} />
          ) : null}
        </div>
        <div className="mt-8">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-black/45">
            {beat.primaryGenre ?? "Instrumentale"}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-black">
            {beat.title}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-black/65">
            {beat.description ?? "Le vendeur n a pas encore ajoute de description."}
          </p>
        </div>
        {audio ? (
          <audio className="mt-6 w-full" controls preload="none" src={`/${audio.objectKey}`} />
        ) : null}
      </section>

      <aside className="h-fit border border-black/10 bg-white p-6">
        <p className="text-3xl font-semibold text-black">
          {formatPrice(beat.priceAmount, beat.currency, beat.isFree)}
        </p>
        <p className="mt-2 text-sm leading-6 text-black/60">
          Achat direct et paiement arrivent dans la prochaine tranche V1. Cette
          fiche expose deja le prix, les assets et l offre de licence.
        </p>
        <div className="mt-6 border-t border-black/10 pt-5">
          <p className="text-sm font-semibold text-black">Vendeur</p>
          {beat.seller.slug ? (
            <Link className="mt-2 block text-sm text-black/65 hover:text-black" href={`/profiles/${beat.seller.slug}`}>
              {beat.seller.displayName ?? beat.seller.slug}
            </Link>
          ) : (
            <p className="mt-2 text-sm text-black/65">Profil vendeur indisponible</p>
          )}
        </div>
        <div className="mt-6 border-t border-black/10 pt-5">
          <p className="text-sm font-semibold text-black">Metadonnees</p>
          <dl className="mt-3 space-y-2 text-sm text-black/65">
            <div className="flex justify-between gap-4">
              <dt>BPM</dt>
              <dd>{beat.bpm ?? "Non renseigne"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Tonalite</dt>
              <dd>{beat.musicalKey ?? "Non renseignee"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>Licence</dt>
              <dd>{beat.licenseOfferings[0]?.title ?? "Basic"}</dd>
            </div>
          </dl>
        </div>
      </aside>
    </main>
  );
}
