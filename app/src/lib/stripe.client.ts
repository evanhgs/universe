import "server-only";

import Stripe from "stripe";

let stripeClient: Stripe | null = null;

/**
 * Lit la cle secrete Stripe obligatoire.
 * @returns Cle secrete Stripe.
 */
function getStripeSecretKey() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("stripe_not_configured");
  }

  return secretKey;
}

/**
 * Lit le secret webhook Stripe obligatoire pour verifier les signatures.
 * @returns Secret de signature webhook.
 */
function getStripeWebhookSecret() {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error("stripe_webhook_not_configured");
  }

  return webhookSecret;
}

/**
 * Determine si Stripe Automatic Tax doit etre active.
 * @returns true si STRIPE_AUTOMATIC_TAX_ENABLED vaut "true".
 */
function getStripeAutomaticTaxEnabled() {
  return process.env.STRIPE_AUTOMATIC_TAX_ENABLED === "true";
}

/**
 * Retourne un client Stripe singleton configure pour le serveur Next.js.
 * @returns Instance Stripe reutilisee en developpement et production.
 */
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

/**
 * Cree une session Stripe Checkout pour une commande marketplace.
 * @param args Identifiants locaux, montant en centimes, devise, libelle et URLs de retour.
 * @returns Session Checkout Stripe.
 */
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
    billing_address_collection: "auto",
    automatic_tax: {
      enabled: getStripeAutomaticTaxEnabled(),
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: args.currency.toLowerCase(),
          unit_amount: args.amountCents,
          tax_behavior: "exclusive",
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

/**
 * Recupere une session Stripe Checkout existante.
 * @param sessionId Identifiant Stripe Checkout Session.
 * @returns Session Stripe avec line_items expand.
 */
export async function retrieveStripeCheckoutSession(sessionId: string) {
  return getStripeClient().checkout.sessions.retrieve(sessionId, {
    expand: ["line_items"],
  });
}

/**
 * Verifie et construit un evenement webhook Stripe depuis le payload brut.
 * @param payload Corps texte exact recu par Stripe.
 * @param signature Header stripe-signature.
 * @returns Evenement Stripe authentifie.
 */
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
