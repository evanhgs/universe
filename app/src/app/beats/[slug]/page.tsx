import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getBeatPayloadBySlug } from "@/server/beats/beat.service";
import { BeatPreviewPlayer } from "./beat-preview-player";
import { BeatPurchasePanel } from "./beat-purchase-panel";

type BeatDetailPageProps = {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    checkout?: string;
  }>;
};

export const dynamic = "force-dynamic";

/**
 * Formate le prix hors taxe affiche dans le detail beat.
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
 * Page serveur de detail beat, avec preview, metadonnees et panneau d'achat.
 * @param props.params Parametres de route contenant slug.
 * @param props.searchParams Query string contenant l'etat de checkout.
 * @returns Markup de detail beat ou notFound si inaccessible.
 */
export default async function BeatDetailPage({ params, searchParams }: BeatDetailPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { userId } = await auth();
  const beat = await getBeatPayloadBySlug(slug, userId ?? null);

  if (!beat) {
    notFound();
  }

  const audio = beat.assets.find((asset) => asset.role === "AUDIO_PREVIEW");
  const thumbnail = beat.assets.find((asset) => asset.role === "IMAGE_THUMBNAIL");
  const lowestLicense = beat.licenseOfferings.reduce<(typeof beat.licenseOfferings)[number] | null>(
    (lowest, offering) =>
      lowest === null || (offering.priceAmount ?? 0) < (lowest.priceAmount ?? 0)
        ? offering
        : lowest,
    null,
  );
  const licenseOfferings = beat.licenseOfferings.map((offering) => ({
    ...offering,
    priceAmount: offering.priceAmount ?? 0,
  }));

  return (
    <main className="mx-auto grid min-h-[calc(100vh-73px)] w-full max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[1fr_360px]">
      <section>
        <Link className="text-sm font-medium text-black/55 hover:text-black" href="/beats">
          Retour au catalogue
        </Link>
        <div className="mt-6 aspect-video overflow-hidden border border-black/10 bg-black/[0.04]">
          {thumbnail?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" className="h-full w-full object-cover" src={thumbnail.url} />
          ) : null}
        </div>
        <div className="mt-8">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-black/45">
            {beat.primaryGenre ?? "Instrumentale"}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-black">
            {beat.title}
          </h1>
          <p>
            Une instru du vendeur : {beat.seller.slug}
          </p>
          <p className="mt-4 max-w-3xl text-base leading-7 text-black/65">
            {beat.description ?? "Le vendeur n a pas encore ajoute de description."}
          </p>
        </div>
        <BeatPreviewPlayer
          beatSlug={beat.slug}
          initialUrl={audio?.url ?? null}
          shouldPoll={beat.status === "PROCESSING"}
        />
      </section>

      <aside className="h-fit border border-black/10 bg-white p-6">
        <p className="text-3xl font-semibold text-black">
          A partir de{" "}
          {formatPriceHT(lowestLicense?.priceAmount ?? beat.priceAmount, beat.currency, beat.isFree)}
        </p>
        <p className="mt-2 text-sm leading-6 text-black/60">
          Achat securise via Stripe. Les fichiers complets restent prives et sont
          deverrouilles seulement apres paiement valide.
        </p>
        <BeatPurchasePanel
          beatSlug={beat.slug}
          checkoutCancelled={query.checkout === "cancelled"}
          isOwner={beat.viewer.viewerCanEdit}
          licenseOfferings={licenseOfferings}
        />
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
