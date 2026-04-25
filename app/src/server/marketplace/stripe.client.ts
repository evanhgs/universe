import "server-only";

import Stripe from "stripe";

let stripeClient: Stripe | null = null;

function getStripeSecretKey() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("stripe_not_configured");
  }

  return secretKey;
}

function getStripeWebhookSecret() {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error("stripe_webhook_not_configured");
  }

  return webhookSecret;
}

function getStripeAutomaticTaxEnabled() {
  return process.env.STRIPE_AUTOMATIC_TAX_ENABLED === "true";
}

export function getStripeClient() {
  if (!stripeClient) {
    stripeClient = new Stripe(getStripeSecretKey(), {
      appInfo: {
        name: "Universe",
      },
      maxNetworkRetries: 2,
      timeout: 10000,
    });
  }

  return stripeClient;
}

export async function createStripeCheckoutSession(args: {
  orderId: string;
  paymentId: string;
  buyerId: string;
  amountCents: number;
  currency: string;
  title: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const metadata = {
    orderId: args.orderId,
    paymentId: args.paymentId,
    buyerId: args.buyerId,
  };

  return getStripeClient().checkout.sessions.create({
    mode: "payment",
    client_reference_id: args.orderId,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    automatic_tax: {
      enabled: getStripeAutomaticTaxEnabled(),
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: args.currency.toLowerCase(),
          unit_amount: args.amountCents,
          product_data: {
            name: args.title,
          },
        },
      },
    ],
    metadata,
    payment_intent_data: {
      metadata,
    },
  });
}

export async function retrieveStripeCheckoutSession(sessionId: string) {
  return getStripeClient().checkout.sessions.retrieve(sessionId, {
    expand: ["line_items"],
  });
}

export function constructStripeWebhookEvent(payload: string, signature: string | null) {
  if (!signature) {
    throw new Error("stripe_signature_missing");
  }

  return getStripeClient().webhooks.constructEvent(
    payload,
    signature,
    getStripeWebhookSecret(),
  );
}
