import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { marketplaceErrorResponse } from "@/server/marketplace/marketplace.http";
import { listCurrentSellerSales } from "@/server/marketplace/marketplace.service";

export const dynamic = "force-dynamic";

/**
 * Liste les ventes du vendeur authentifie.
 * @returns Reponse JSON privee avec lignes de commandes vendeur.
 */
export async function GET() {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  try {
    const sales = await listCurrentSellerSales(userId);

    return NextResponse.json(
      {
        items: sales,
        count: sales.length,
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
