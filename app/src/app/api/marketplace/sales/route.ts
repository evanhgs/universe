import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { marketplaceErrorResponse } from "@/server/marketplace/marketplace.http";
import { getCurrentSellerDashboard } from "@/server/marketplace/marketplace.service";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Retourne le dashboard vendeur V1.
 * @returns Reponse JSON privee avec ventes, revenus et instrumentales.
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
    policy: RATE_LIMITS.marketplaceRead,
    userId,
  });
  if (limited) return limited;

  try {
    return NextResponse.json(await getCurrentSellerDashboard(userId), {
      status: 200,
      headers: PRIVATE_JSON_HEADERS,
    });
  } catch (error) {
    return marketplaceErrorResponse(error);
  }
}
