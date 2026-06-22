import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { BEAT_SLUG_PATTERN } from "@/server/beats/beat.constants";
import {
  getBeatPreviewJobForCurrentSeller,
  retryBeatPreviewForCurrentSeller,
} from "@/server/beats/beat.service";
import { PRIVATE_JSON_HEADERS, PUBLIC_JSON_HEADERS } from "@/server/http/response-headers";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamic = "force-dynamic";

/**
 * Convertit une erreur d'orchestration de retry preview en reponse HTTP
 * lisible. Les codes correspondent a ceux leves par le repository / service
 * beat (voir audit B6).
 */
function retryErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "unknown_error";
  const status =
    code === "beat_not_found"
      ? 404
      : code === "beat_forbidden"
        ? 403
        : code === "account_not_found"
            ? 401
            : code === "beat_preview_job_missing"
              ? 404
              : code === "beat_preview_job_not_retryable"
                ? 409
                : 400;

  return NextResponse.json(
    { error: code },
    { status, headers: PRIVATE_JSON_HEADERS },
  );
}

/**
 * Retourne l'etat courant du job de preview pour ce beat (auth seller owner).
 * Utilise par l'UI dashboard pour afficher PENDING/PROCESSING/FAILED et
 * decider quand proposer le bouton "Relancer" (audit B6, volet 3).
 */
export async function GET(request: Request, context: RouteContext) {
  const { slug } = await context.params;

  if (!BEAT_SLUG_PATTERN.test(slug)) {
    return NextResponse.json(
      { error: "invalid_beat_slug" },
      { status: 400, headers: PUBLIC_JSON_HEADERS },
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const limited = await enforceRateLimit({
    request,
    policy: RATE_LIMITS.marketplaceRead,
    userId,
  });
  if (limited) return limited;

  try {
    const job = await getBeatPreviewJobForCurrentSeller(userId, slug);
    if (!job) {
      return NextResponse.json(
        { error: "beat_preview_job_missing" },
        { status: 404, headers: PRIVATE_JSON_HEADERS },
      );
    }
    return NextResponse.json(job, { status: 200, headers: PRIVATE_JSON_HEADERS });
  } catch (error) {
    return retryErrorResponse(error);
  }
}

/**
 * Relance le job de generation de preview pour le beat du vendeur authentifie
 * (audit B6 volet 2). N'accepte le retry que si le job est en FAILED ou si son
 * verrou PROCESSING est obsolete (>5min, voir C7).
 */
export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;

  if (!BEAT_SLUG_PATTERN.test(slug)) {
    return NextResponse.json(
      { error: "invalid_beat_slug" },
      { status: 400, headers: PUBLIC_JSON_HEADERS },
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const limited = await enforceRateLimit({
    request,
    policy: RATE_LIMITS.marketplaceWrite,
    userId,
  });
  if (limited) return limited;

  try {
    const job = await retryBeatPreviewForCurrentSeller(userId, slug);
    return NextResponse.json(job, { status: 200, headers: PRIVATE_JSON_HEADERS });
  } catch (error) {
    return retryErrorResponse(error);
  }
}
