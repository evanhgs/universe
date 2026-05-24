import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { marketplaceErrorResponse } from "@/server/marketplace/marketplace.http";
import { createStripeCheckoutForCurrentBuyer } from "@/server/marketplace/marketplace.service";
import { parseStripeCheckoutInput } from "@/server/marketplace/marketplace.validation";
import { enforceRateLimit, RATE_LIMITS } from "@/server/security/rate-limit";

type RouteContext = {
  params: Promise<{
    orderId: string;
  }>;
};

export const dynamic = "force-dynamic";

/**
 * Lit un body JSON optionnel sans forcer les clients a envoyer un objet vide.
 * @param request Requete HTTP entrante.
 * @returns Payload parse ou undefined si le body est vide.
 */
async function readOptionalJson(request: Request) {
  const text = await request.text();

  return text ? JSON.parse(text) : undefined;
}

/**
 * Cree une session Stripe Checkout pour une commande de l'acheteur courant.
 * @param request Requete HTTP avec URLs de retour optionnelles.
 * @param context Parametres de route contenant orderId.
 */
export async function POST(request: Request, context: RouteContext) {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated) {
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
