import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import {
  getCurrentAccountSnapshot,
  updateCurrentAccountRoles,
} from "@/server/account/account.service";
import { parseSelfServiceRoles } from "@/server/account/account.validation";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

/**
 * Retourne les roles du compte authentifie.
 * @returns Reponse JSON privee contenant roles.
 */
export async function GET(request: Request = new Request("http://localhost")) {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const limited = await enforceRateLimit({
    request,
    policy: RATE_LIMITS.accountWrite,
  });
  if (limited) return limited;

  const account = await getCurrentAccountSnapshot();

  return NextResponse.json(
    { roles: account.roles },
    {
      status: 200,
      headers: PRIVATE_JSON_HEADERS,
    },
  );
}

/**
 * Remplace les roles self-service du compte authentifie.
 * @param request Requete HTTP contenant roles: string[].
 */
export async function PUT(request: Request) {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const limited = await enforceRateLimit({
    request,
    policy: RATE_LIMITS.accountWrite,
    userId,
  });
  if (limited) return limited;

  try {
    const roles = parseSelfServiceRoles(await request.json());
    const account = await updateCurrentAccountRoles(userId, roles);

    return NextResponse.json(
      { roles: account.roles },
      {
        status: 200,
        headers: PRIVATE_JSON_HEADERS,
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "invalid_roles_update",
        message: error instanceof Error ? error.message : "Unknown error.",
      },
      {
        status: 400,
        headers: PRIVATE_JSON_HEADERS,
      },
    );
  }
}
