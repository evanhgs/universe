import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { createUniverseSubscriptionCheckoutForCurrentUser } from "@/server/subscriptions/subscription.service";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

export const dynamic = "force-dynamic";

function subscriptionErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "unknown_error";
  const status =
    code === "account_not_found"
      ? 401
      : code === "subscription_already_active"
        ? 409
      : code === "stripe_not_configured" || code === "stripe_universe_price_not_configured"
        ? 503
        : 400;

  return NextResponse.json({ error: code, message: code }, { status, headers: PRIVATE_JSON_HEADERS });
}

/**
 * Cree une session Stripe Checkout Billing pour passer a Universe.
 */
export async function POST(request: Request) {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated || !userId) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const limited = await enforceRateLimit({
    request,
    policy: RATE_LIMITS.marketplaceWrite,
    userId,
  });
  if (limited) return limited;

  try {
    const checkout = await createUniverseSubscriptionCheckoutForCurrentUser(userId, request.url);

    return NextResponse.json(checkout, { status: 200, headers: PRIVATE_JSON_HEADERS });
  } catch (error) {
    return subscriptionErrorResponse(error);
  }
}
