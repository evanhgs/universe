import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  listRecommendedFeedPagePayload,
  parseRecommendedFeedQuery,
} from "@/server/analytics/analytics.service";
import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

async function findViewerUserId(clerkUserId: string | null | undefined) {
  if (!clerkUserId) {
    return null;
  }

  const user = await getPrisma().user.findUnique({
    where: { clerkUserId },
    select: { id: true },
  });

  return user?.id ?? null;
}

/**
 * Retourne une page de beats pour le feed decouverte V2.
 * @param request Requete contenant limit et cursor en query string.
 */
export async function GET(request: Request) {
  const { isAuthenticated, userId } = await auth();
  const limited = await enforceRateLimit({
    request,
    policy: RATE_LIMITS.publicEnumeration,
    userId,
  });
  if (limited) return limited;

  try {
    const query = parseRecommendedFeedQuery(new URL(request.url));
    const page = await listRecommendedFeedPagePayload({
      ...query,
      viewerUserId: isAuthenticated ? await findViewerUserId(userId) : null,
    });

    return NextResponse.json(page, {
      status: 200,
      headers: PRIVATE_JSON_HEADERS,
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
        headers: PRIVATE_JSON_HEADERS,
      },
    );
  }
}
