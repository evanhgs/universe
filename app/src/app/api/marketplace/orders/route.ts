import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { marketplaceErrorResponse } from "@/server/marketplace/marketplace.http";
import { createDirectPurchaseOrderForCurrentBuyer } from "@/server/marketplace/marketplace.service";
import { parseCreateDirectPurchaseOrderInput } from "@/server/marketplace/marketplace.validation";
import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";

export const dynamic = "force-dynamic";

/**
 * Cree une commande marketplace pour l'acheteur authentifie.
 * @param request Requete HTTP contenant beatSlug ou licenseOfferingId.
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
    const input = parseCreateDirectPurchaseOrderInput(await request.json());
    const order = await createDirectPurchaseOrderForCurrentBuyer(userId, input);

    return NextResponse.json(order, {
      status: 201,
      headers: PRIVATE_JSON_HEADERS,
    });
  } catch (error) {
    return marketplaceErrorResponse(error);
  }
}
