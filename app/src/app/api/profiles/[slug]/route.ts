import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import {
  getProfilePayloadBySlug,
  isValidProfileSlug,
} from "@/server/profiles/profile.service";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

/**
 * Retourne le profil public ou proprietaire correspondant au slug.
 * @param _request Requete HTTP non utilisee.
 * @param context Parametres de route contenant slug.
 */
export async function GET(request: Request, context: RouteContext) {
  const { slug } = await context.params;

  if (!isValidProfileSlug(slug)) {
    return NextResponse.json(
      {
        error: "invalid_profile_slug",
      },
      {
        status: 400,
        headers: PRIVATE_JSON_HEADERS,
      },
    );
  }

  const limited = await enforceRateLimit({
    request,
    policy: RATE_LIMITS.publicEnumeration,
  });
  if (limited) return limited;

  const { userId } = await auth();
  const profile = await getProfilePayloadBySlug(slug, userId ?? null);

  if (!profile) {
    return NextResponse.json(
      {
        error: "profile_not_found",
      },
      {
        status: 404,
        headers: PRIVATE_JSON_HEADERS,
      },
    );
  }

  return NextResponse.json(profile, {
    status: 200,
    headers: PRIVATE_JSON_HEADERS,
  });
}
