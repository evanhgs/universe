import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { listProfilesPayload } from "@/server/profiles/profile.service";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Liste les profils disponibles pour un utilisateur authentifie.
 * @returns Reponse JSON privee avec items et count.
 */
export async function GET(request: Request = new Request("http://localhost")) {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return NextResponse.json(
      {
        error: "unauthorized",
      },
      {
        status: 401,
        headers: PRIVATE_JSON_HEADERS,
      },
    );
  }

  const limited = await enforceRateLimit({
    request,
    policy: RATE_LIMITS.publicEnumeration,
  });
  if (limited) return limited;

  const profiles = await listProfilesPayload();

  return NextResponse.json(
    {
      items: profiles,
      count: profiles.length,
    },
    {
      status: 200,
      headers: PRIVATE_JSON_HEADERS,
    },
  );
}
