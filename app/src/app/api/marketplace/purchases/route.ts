import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { marketplaceErrorResponse } from "@/server/marketplace/marketplace.http";
import { listCurrentBuyerPurchases } from "@/server/marketplace/marketplace.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

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
