import { handleStripeCheckoutWebhookEvent } from "@/server/marketplace/marketplace.service";
import { constructStripeWebhookEvent } from "@/lib/stripe.client";

export const dynamic = "force-dynamic";

/**
 * Recoit les webhooks Stripe, verifie la signature et applique les evenements Checkout.
 * @param request Requete HTTP contenant le body brut Stripe.
 */
export async function POST(request: Request) {
  try {
    const payload = await request.text();
    const signature = request.headers.get("stripe-signature");
    const event = constructStripeWebhookEvent(payload, signature);

    await handleStripeCheckoutWebhookEvent(event);

    return Response.json({ ok: true }, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        error: "invalid_stripe_webhook",
        message: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 400 },
    );
  }
}
