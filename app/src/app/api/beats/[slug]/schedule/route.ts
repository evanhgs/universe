import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS, PUBLIC_JSON_HEADERS } from "@/server/http/response-headers";
import {
  cancelBeatPublicationScheduleForCurrentSeller,
  scheduleBeatPublicationForCurrentSeller,
} from "@/server/beats/beat.service";
import { BEAT_SLUG_PATTERN } from "@/server/beats/beat.constants";
import { parseScheduleBeatInput } from "@/server/beats/beat.validation";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

/**
 * Reponse standard pour un slug de beat invalide.
 * @returns JSON public avec statut 400.
 */
function invalidSlugResponse() {
  return NextResponse.json(
    { error: "invalid_beat_slug" },
    { status: 400, headers: PUBLIC_JSON_HEADERS },
  );
}

/**
 * Transforme une erreur de programmation en reponse HTTP lisible.
 * @param error Erreur issue du service ou repository beat.
 */
function scheduleErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "unknown_error";
  const status =
    code === "beat_forbidden"
      ? 403
      : code === "beat_already_published" ||
          code === "beat_not_scheduled" ||
          code === "beat_not_schedulable" ||
          code === "stripe_catalog_not_ready"
        ? 409
        : code === "stripe_not_configured"
          ? 503
          : 400;

  return NextResponse.json(
    { error: code, message: code },
    { status, headers: PRIVATE_JSON_HEADERS },
  );
}

/**
 * Garde commune aux mutations : slug valide, session authentifiee, rate limit.
 * @returns Identifiant Clerk si autorise, sinon une reponse a retourner.
 */
async function guardSellerMutation(request: Request, slug: string) {
  if (!BEAT_SLUG_PATTERN.test(slug)) {
    return { response: invalidSlugResponse() };
  }

  const { userId } = await auth();

  if (!userId) {
    return {
      response: NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: PRIVATE_JSON_HEADERS },
      ),
    };
  }

  const limited = await enforceRateLimit({
    request,
    policy: RATE_LIMITS.marketplaceWrite,
    userId,
  });
  if (limited) {
    return { response: limited };
  }

  return { userId };
}

/**
 * Programme la publication d'un beat appartenant au vendeur authentifie.
 * Le beat reste prive jusqu'au jour J.
 * @param request Requete HTTP contenant scheduledPublishAt (ISO 8601).
 * @param context Parametres de route contenant slug.
 */
export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const guard = await guardSellerMutation(request, slug);

  if (guard.response) {
    return guard.response;
  }

  try {
    const { scheduledPublishAt } = parseScheduleBeatInput(await request.json());
    const beat = await scheduleBeatPublicationForCurrentSeller(
      guard.userId,
      slug,
      scheduledPublishAt,
    );

    if (!beat) {
      return NextResponse.json(
        { error: "beat_not_found" },
        { status: 404, headers: PRIVATE_JSON_HEADERS },
      );
    }

    return NextResponse.json(beat, { status: 200, headers: PRIVATE_JSON_HEADERS });
  } catch (error) {
    return scheduleErrorResponse(error);
  }
}

/**
 * Annule la programmation d'un beat appartenant au vendeur authentifie.
 * @param request Requete HTTP non utilisee hors auth.
 * @param context Parametres de route contenant slug.
 */
export async function DELETE(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const guard = await guardSellerMutation(request, slug);

  if (guard.response) {
    return guard.response;
  }

  try {
    const beat = await cancelBeatPublicationScheduleForCurrentSeller(guard.userId, slug);

    if (!beat) {
      return NextResponse.json(
        { error: "beat_not_found" },
        { status: 404, headers: PRIVATE_JSON_HEADERS },
      );
    }

    return NextResponse.json(beat, { status: 200, headers: PRIVATE_JSON_HEADERS });
  } catch (error) {
    return scheduleErrorResponse(error);
  }
}
