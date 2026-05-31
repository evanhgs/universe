import { NextResponse } from "next/server";

import { listPublishedFeedPagePayload } from "@/server/beats/beat.service";
import { parseBeatFeedQuery } from "@/server/beats/beat.validation";
import { PUBLIC_JSON_HEADERS } from "@/server/http/response-headers";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Retourne une page de beats pour le feed decouverte V2.
 * @param request Requete contenant limit et cursor en query string.
 */
export async function GET(request: Request) {
  const limited = await enforceRateLimit({
    request,
    policy: RATE_LIMITS.publicEnumeration,
  });
  if (limited) return limited;

  try {
    const page = await listPublishedFeedPagePayload(parseBeatFeedQuery(new URL(request.url)));

    return NextResponse.json(page, {
      status: 200,
      headers: PUBLIC_JSON_HEADERS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";

    return NextResponse.json(
      {
        error: message,
        message,
      },
      {
        status: message === "feed_cursor_invalid" ? 400 : 500,
        headers: PUBLIC_JSON_HEADERS,
      },
    );
  }
}
