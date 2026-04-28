import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { marketplaceErrorResponse } from "@/server/marketplace/marketplace.http";
import {
  confirmStripeCheckoutSessionForOrder,
  confirmStripePaymentForCurrentBuyer,
} from "@/server/marketplace/marketplace.service";
import { parseStripeConfirmationInput } from "@/server/marketplace/marketplace.validation";

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

  try {
    const { orderId } = await context.params;
    const input = parseStripeConfirmationInput(await readOptionalJson(request));
    const order =
      isAuthenticated && userId
        ? await confirmStripePaymentForCurrentBuyer(userId, orderId, input)
        : await confirmStripeCheckoutSessionForOrder(orderId, input);

    return NextResponse.json(order, {
      status: 200,
      headers: PRIVATE_JSON_HEADERS,
    });
  } catch (error) {
    return marketplaceErrorResponse(error);
  }
}
