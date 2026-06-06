import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS, PUBLIC_JSON_HEADERS } from "@/server/http/response-headers";
import {
  deleteBeatForCurrentSeller,
  getBeatPayloadBySlug,
  updateBeatForCurrentSeller,
} from "@/server/beats/beat.service";
import { BEAT_SLUG_PATTERN } from "@/server/beats/beat.constants";
import { parseUpdateBeatInput } from "@/server/beats/beat.validation";
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
    {
      error: "invalid_beat_slug",
    },
    {
      status: 400,
      headers: PUBLIC_JSON_HEADERS,
    },
  );
}

/**
 * Transforme une erreur de mutation beat en reponse HTTP lisible.
 * @param error Erreur issue du service ou repository beat.
 */
function mutationErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "Unknown error.";
  const status =
    code === "seller_role_required"
      ? 403
      : code === "beat_forbidden"
        ? 403
      : code === "beat_asset_duplicate"
        ? 409
        : 400;
  const message =
    code === "beat_forbidden"
      ? "You do not have permissions to modify this beat."
      : code === "seller_role_required"
        ? "A seller account is required to modify beats."
      : code === "beat_asset_duplicate"
        ? "This beat asset is already attached to another beat."
      : code;

  return NextResponse.json(
    {
      error: code,
      message,
    },
    {
      status,
      headers: PRIVATE_JSON_HEADERS,
    },
  );
}

/**
 * Retourne le detail d'un beat visible par le visiteur.
 * @param _request Requete HTTP non utilisee.
 * @param context Parametres de route contenant slug.
 */
export async function GET(request: Request, context: RouteContext) {
  const { slug } = await context.params;

  if (!BEAT_SLUG_PATTERN.test(slug)) {
    return invalidSlugResponse();
  }

  const limited = await enforceRateLimit({
    request,
    policy: RATE_LIMITS.publicEnumeration,
  });
  if (limited) return limited;

  const { userId } = await auth();
  const beat = await getBeatPayloadBySlug(slug, userId ?? null);

  if (!beat) {
    return NextResponse.json(
      { error: "beat_not_found" },
      { status: 404, headers: PUBLIC_JSON_HEADERS },
    );
  }

  return NextResponse.json(beat, {
    status: 200,
    headers: PUBLIC_JSON_HEADERS,
  });
}

/**
 * Modifie un beat appartenant au vendeur authentifie.
 * @param request Requete HTTP contenant le patch beat brut.
 * @param context Parametres de route contenant slug.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const { userId } = await auth();

  if (!BEAT_SLUG_PATTERN.test(slug)) {
    return invalidSlugResponse();
  }

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
    const input = parseUpdateBeatInput(await request.json());
    const beat = await updateBeatForCurrentSeller(userId, slug, input);

    if (!beat) {
      return NextResponse.json(
        { error: "beat_not_found" },
        { status: 404, headers: PRIVATE_JSON_HEADERS },
      );
    }

    return NextResponse.json(beat, {
      status: 200,
      headers: PRIVATE_JSON_HEADERS,
    });
  } catch (error) {
    return mutationErrorResponse(error);
  }
}

/**
 * Supprime logiquement un beat appartenant au vendeur authentifie.
 * @param _request Requete HTTP non utilisee.
 * @param context Parametres de route contenant slug.
 */
export async function DELETE(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const { isAuthenticated, userId } = await auth();

  if (!BEAT_SLUG_PATTERN.test(slug)) {
    return invalidSlugResponse();
  }

  if (!isAuthenticated) {
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
    const deleted = await deleteBeatForCurrentSeller(userId, slug);

    if (!deleted) {
      return NextResponse.json(
        { error: "beat_not_found" },
        { status: 404, headers: PRIVATE_JSON_HEADERS },
      );
    }

    return NextResponse.json(
      { ok: true },
      { status: 200, headers: PRIVATE_JSON_HEADERS },
    );
  } catch (error) {
    return mutationErrorResponse(error);
  }
}
