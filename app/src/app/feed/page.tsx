import { listPublishedFeedPagePayload } from "@/server/beats/beat.service";

import { FeedClient } from "./feed-client";

export const dynamic = "force-dynamic";

/**
 * Page feed decouverte V2 avec premiere page rendue cote serveur.
 */
export default async function FeedPage() {
  const firstPage = await listPublishedFeedPagePayload({ limit: 10 });

  return <FeedClient {...firstPage} />;
}
