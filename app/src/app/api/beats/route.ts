import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS, PUBLIC_JSON_HEADERS } from "@/server/http/response-headers";
import {
  createBeatForCurrentSeller,
  listPublishedBeatsPayload,
} from "@/server/beats/beat.service";
import { parseBeatListQuery, parseCreateBeatInput } from "@/server/beats/beat.validation";

export const dynamic = "force-dynamic";

/**
 * Transforme une erreur beat en reponse JSON privee.
 * @param error Erreur issue de la validation ou du service beat.
 */
function beatErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error.";
  const status =
    message === "seller_role_required"
      ? 403
      : message === "beat_asset_duplicate"
        ? 409
        : 400;

  return NextResponse.json(
    {
      error: message,
      message,
    },
    {
      status,
      headers: PRIVATE_JSON_HEADERS,
    },
  );
}

/**
 * Liste les beats publics du catalogue.
 * @param request Requete HTTP contenant les filtres de recherche en query string.
 */
export async function GET(request: Request) {
  const beats = await listPublishedBeatsPayload(parseBeatListQuery(new URL(request.url)));

  return NextResponse.json(
    {
      items: beats,
      count: beats.length,
    },
    {
      status: 200,
      headers: PUBLIC_JSON_HEADERS,
    },
  );
}

/**
 * Cree un beat pour le vendeur authentifie.
 * @param request Requete HTTP contenant le payload CreateBeatInput brut.
 */
export async function POST(request: Request) {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  try {
    const input = parseCreateBeatInput(await request.json());
    const beat = await createBeatForCurrentSeller(userId, input);

    return NextResponse.json(beat, {
      status: 201,
      headers: PRIVATE_JSON_HEADERS,
    });
  } catch (error) {
    return beatErrorResponse(error);
  }
}
