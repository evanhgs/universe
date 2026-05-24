import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { marketplaceErrorResponse } from "@/server/marketplace/marketplace.http";
import { listCurrentBuyerPurchases } from "@/server/marketplace/marketplace.service";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Liste les achats de l'acheteur authentifie.
 * @returns Reponse JSON privee avec commandes et entitlements.
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
    const purchases = await listCurrentBuyerPurchases(userId);

    return NextResponse.json(
      {
        items: purchases,
        count: purchases.length,
      },
      {
        status: 200,
        headers: PRIVATE_JSON_HEADERS,
      },
    );
  } catch (error) {
    return marketplaceErrorResponse(error);
  }
}
