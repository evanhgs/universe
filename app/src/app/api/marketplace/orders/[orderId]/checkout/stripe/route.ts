import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { marketplaceErrorResponse } from "@/server/marketplace/marketplace.http";
import { createStripeCheckoutForCurrentBuyer } from "@/server/marketplace/marketplace.service";
import { parseStripeCheckoutInput } from "@/server/marketplace/marketplace.validation";

type RouteContext = {
  params: Promise<{
    orderId: string;
  }>;
};

export const dynamic = "force-dynamic";

async function readOptionalJson(request: Request) {
  const text = await request.text();

  return text ? JSON.parse(text) : undefined;
}

export async function POST(request: Request, context: RouteContext) {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  try {
    const { orderId } = await context.params;
    const input = parseStripeCheckoutInput(await readOptionalJson(request));
    const checkout = await createStripeCheckoutForCurrentBuyer(
      userId,
      orderId,
      input,
      request.url,
    );

    return NextResponse.json(checkout, {
      status: 201,
      headers: PRIVATE_JSON_HEADERS,
    });
  } catch (error) {
    return marketplaceErrorResponse(error);
  }
}
