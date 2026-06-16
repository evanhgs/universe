import "server-only";

import Stripe from "stripe";

import { FRANCE_DEFAULT_VAT_RATE_PERCENT } from "@/server/marketplace/marketplace.constants";

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

async function getDefaultFrenchVatTaxRateId() {
  const configuredTaxRateId = process.env.STRIPE_FR_VAT_TAX_RATE_ID?.trim();

  if (configuredTaxRateId) {
    return configuredTaxRateId;
  }

  const stripe = getStripeClient();
  const rates = await stripe.taxRates.list({
    active: true,
    limit: 100,
  });
  const existing = rates.data.find(
    (rate) =>
      rate.country === "FR" &&
      rate.inclusive === false &&
      rate.percentage === FRANCE_DEFAULT_VAT_RATE_PERCENT &&
      rate.tax_type === "vat",
  );

  if (existing) {
    return existing.id;
  }

  const created = await stripe.taxRates.create({
    active: true,
    country: "FR",
    description: "TVA France appliquee par defaut aux achats marketplace Universe.",
    display_name: "TVA",
    inclusive: false,
    jurisdiction: "FR",
    metadata: {
      purpose: "universe_marketplace_default_tax",
    },
    percentage: FRANCE_DEFAULT_VAT_RATE_PERCENT,
    tax_type: "vat",
  });

  return created.id;
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
  stripePriceIdSnapshots: string[];
  successUrl: string;
  cancelUrl: string;
}) {
  const metadata = {
    orderId: args.orderId,
    paymentId: args.paymentId,
    buyerId: args.buyerId,
  };
  const taxRateId = await getDefaultFrenchVatTaxRateId();

  return getStripeClient().checkout.sessions.create({
    mode: "payment",
    client_reference_id: args.orderId,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    billing_address_collection: "required",
    automatic_tax: {
      enabled: !taxRateId && getStripeAutomaticTaxEnabled(),
    },
    line_items: args.stripePriceIdSnapshots.map((price) => ({
      price,
      quantity: 1,
      tax_rates: taxRateId ? [taxRateId] : undefined,
    })),
    metadata,
    payment_intent_data: {
      metadata,
    },
  });
}

/**
 * Cree un customer Stripe rattache a un utilisateur local.
 */
export async function createStripeCustomer(args: {
  userId: string;
  clerkUserId: string | null;
  email: string;
  name?: string | null;
}) {
  return getStripeClient().customers.create({
    email: args.email,
    name: args.name ?? undefined,
    metadata: {
      userId: args.userId,
      clerkUserId: args.clerkUserId ?? "",
    },
  });
}

/**
 * Cree une session Checkout Stripe Billing pour l'abonnement Universe.
 */
export async function createStripeSubscriptionCheckoutSession(args: {
  customerId: string;
  userId: string;
  planCode: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  const metadata = {
    purpose: "universe_subscription",
    userId: args.userId,
    planCode: args.planCode,
  };

  return getStripeClient().checkout.sessions.create({
    mode: "subscription",
    customer: args.customerId,
    client_reference_id: args.userId,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    line_items: [
      {
        price: args.priceId,
        quantity: 1,
      },
    ],
    metadata,
    subscription_data: {
      metadata,
    },
  });
}

/**
 * Cree une session Stripe Customer Portal pour gerer un abonnement.
 */
export async function createStripeBillingPortalSession(args: {
  customerId: string;
  returnUrl: string;
}) {
  return getStripeClient().billingPortal.sessions.create({
    customer: args.customerId,
    return_url: args.returnUrl,
  });
}

/**
 * Recupere une session Stripe Checkout existante.
 * @param sessionId Identifiant Stripe Checkout Session.
 * @returns Session Stripe avec line_items expand.
 */
export async function retrieveStripeCheckoutSession(sessionId: string) {
  return getStripeClient().checkout.sessions.retrieve(sessionId, {
    expand: ["line_items", "subscription"],
  });
}

/**
 * Recupere un abonnement Stripe Billing.
 */
export async function retrieveStripeSubscription(subscriptionId: string) {
  return getStripeClient().subscriptions.retrieve(subscriptionId);
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
