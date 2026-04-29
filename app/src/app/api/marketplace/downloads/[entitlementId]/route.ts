import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { marketplaceErrorResponse } from "@/server/marketplace/marketplace.http";
import { getDownloadAccessForCurrentBuyer } from "@/server/marketplace/marketplace.service";

type RouteContext = {
  params: Promise<{
    entitlementId: string;
  }>;
};

export const dynamic = "force-dynamic";

/**
 * Genere une URL de telechargement protegee pour un entitlement de l'acheteur.
 * @param _request Requete HTTP non utilisee.
 * @param context Parametres de route contenant entitlementId.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  try {
    const { entitlementId } = await context.params;
    const download = await getDownloadAccessForCurrentBuyer(userId, entitlementId);

    return NextResponse.json(download, {
      status: 200,
      headers: PRIVATE_JSON_HEADERS,
    });
  } catch (error) {
    return marketplaceErrorResponse(error);
  }
}
