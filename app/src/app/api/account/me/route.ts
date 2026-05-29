import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { getCurrentAccountSnapshot } from "@/server/account/account.service";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

/**
 * Retourne le snapshot complet du compte authentifie.
 * @returns Reponse JSON privee avec user, profile et roles.
 */
export async function GET(request: Request = new Request("http://localhost")) {
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

  const account = await getCurrentAccountSnapshot();

  return NextResponse.json(account, {
    status: 200,
    headers: PRIVATE_JSON_HEADERS,
  });
}
