import type { Metadata } from "next";

import { listRecommendedFeedPagePayload } from "@/server/analytics/analytics.service";

import { FeedClient } from "./feed-client";
import { RushChrome } from "./rush-chrome";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rush — Universe",
  description:
    "Rush, le feed rapide d'Universe : un beat plein écran à la fois, navigation clavier et molette.",
};

/**
 * Page Rush : feed decouverte plein ecran avec chrome immersif phantom-style
 * (retour, navigation basse, raccourcis clavier).
 */
export default async function RushPage() {
  const firstPage = await listRecommendedFeedPagePayload({ limit: 10 });

  return (
    <main className="min-h-screen bg-[#060609]">
      <RushChrome />
      <FeedClient {...firstPage} />
    </main>
  );
}
