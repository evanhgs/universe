import { LandingExperience } from "@/components/landing/landing-experience";
import { listPublishedBeatsPayload } from "@/server/beats/beat.service";
import type { LandingBeat } from "@/components/landing/types";

export const dynamic = "force-dynamic";

/**
 * Landing immersive : loader tech, ecran de choix Catalogue / Rush puis
 * grille infinie des beats. Les URLs d'assets sont presignees ici cote
 * serveur pour la premiere fenetre de beats.
 * @returns Experience landing complete.
 */
export default async function Home() {
  const page = await listPublishedBeatsPayload({
    sort: "newest",
    limit: 160,
    page: 1,
  });

  const beats: LandingBeat[] = page.items.map((item) => ({
    id: item.id,
    slug: item.slug,
    title: item.title,
    sellerName: item.seller.displayName ?? "Producteur",
    sellerSlug: item.seller.slug,
    bpm: item.bpm,
    musicalKey: item.musicalKey,
    genre: item.primaryGenre,
    mood: item.primaryMood,
    priceAmount: item.priceAmount,
    currency: item.currency,
    isFree: item.isFree,
    previewUrl: item.assets.find((asset) => asset.role === "AUDIO_PREVIEW")?.url ?? null,
    coverUrl: item.assets.find((asset) => asset.role === "IMAGE_THUMBNAIL")?.url ?? null,
  }));

  return <LandingExperience beats={beats} totalBeats={page.totalItems} />;
}
