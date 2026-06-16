import "server-only";

import type Stripe from "stripe";

import { getPrisma } from "@/lib/prisma";
import {
  createStripeBillingPortalSession,
  createStripeCustomer,
  createStripeSubscriptionCheckoutSession,
  retrieveStripeSubscription,
} from "@/lib/stripe.client";
import { syncCurrentAccountFromClerk } from "@/server/account/account.sync";

import type { SubscriptionStatus } from "../../../generated/prisma/enums";
import {
  DEFAULT_PLATFORM_COMMISSION_RATE_BP,
  PREMIUM_PLATFORM_COMMISSION_RATE_BP,
} from "@/server/marketplace/marketplace.constants";
import { emailService } from "@/server/email/email.service";

const UNIVERSE_MONTHLY_PLAN_CODE = "universe_monthly";
const DEFAULT_UNIVERSE_MONTHLY_PRICE_AMOUNT = 8.99;
const UNIVERSE_MONTHLY_CURRENCY = "EUR";

type SubscriptionLike = Stripe.Subscription & {
  current_period_start?: number | null;
  current_period_end?: number | null;
};

type InvoiceWithSubscription = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null;
};

function getUniverseMonthlyPriceId() {
  const priceId = process.env.STRIPE_UNIVERSE_MONTHLY_PRICE_ID?.trim();

  if (!priceId) {
    throw new Error("stripe_universe_price_not_configured");
  }

  return priceId;
}

function getUniverseMonthlyPriceAmount() {
  const rawAmount = process.env.UNIVERSE_PRICING_MONTHLY_LABEL?.trim();

  if (!rawAmount) {
    return DEFAULT_UNIVERSE_MONTHLY_PRICE_AMOUNT;
  }

  const amount = Number.parseFloat(rawAmount.replace(",", "."));

  return Number.isFinite(amount) && amount > 0 ? amount : DEFAULT_UNIVERSE_MONTHLY_PRICE_AMOUNT;
}

function buildUrl(origin: string, path: string) {
  return new URL(path, origin).toString();
}

function getPublicOrigin(requestUrl: string) {
  const appUrl = process.env.APP_URL;

  if (appUrl) {
    return new URL(appUrl).origin;
  }

  const origin = new URL(requestUrl).origin;

  return origin === "http://0.0.0.0:3000" ? "http://localhost:3000" : origin;
}

function toDateFromUnix(value: number | null | undefined) {
  return typeof value === "number" ? new Date(value * 1000) : null;
}

function stripeSubscriptionId(value: string | Stripe.Subscription | null | undefined) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : value.id;
}

function stripeCustomerId(value: string | Stripe.Customer | Stripe.DeletedCustomer | null) {
  if (!value || typeof value !== "object") {
    return value;
  }

  return value.id;
}

function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "incomplete_expired":
      return "EXPIRED";
    case "paused":
      return "INACTIVE";
    default:
      return "INACTIVE";
  }
}

function isPremiumStatus(status: SubscriptionStatus, currentPeriodEnd: Date | null, now = new Date()) {
  return (
    (status === "ACTIVE" || status === "TRIALING") &&
    (!currentPeriodEnd || currentPeriodEnd > now)
  );
}

async function ensureUniverseMonthlyPlan() {
  const priceAmount = getUniverseMonthlyPriceAmount();

  return getPrisma().subscriptionPlan.upsert({
    where: { code: UNIVERSE_MONTHLY_PLAN_CODE },
    update: {
      name: "Universe",
      interval: "MONTHLY",
      priceAmount,
      currency: UNIVERSE_MONTHLY_CURRENCY,
      reducedCommissionRateBp: PREMIUM_PLATFORM_COMMISSION_RATE_BP,
      stripePriceId: getUniverseMonthlyPriceId(),
      isActive: true,
    },
    create: {
      code: UNIVERSE_MONTHLY_PLAN_CODE,
      name: "Universe",
      interval: "MONTHLY",
      priceAmount,
      currency: UNIVERSE_MONTHLY_CURRENCY,
      reducedCommissionRateBp: PREMIUM_PLATFORM_COMMISSION_RATE_BP,
      stripePriceId: getUniverseMonthlyPriceId(),
      isActive: true,
    },
  });
}

async function findLatestUniverseSubscription(userId: string) {
  return getPrisma().userSubscription.findFirst({
    where: {
      userId,
      plan: {
        code: UNIVERSE_MONTHLY_PLAN_CODE,
        isActive: true,
      },
    },
    include: {
      plan: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });
}

async function getOrCreateStripeCustomer(account: Awaited<ReturnType<typeof syncCurrentAccountFromClerk>>) {
  if (account.stripeCustomerId) {
    return account.stripeCustomerId;
  }

  const customer = await createStripeCustomer({
    userId: account.id,
    clerkUserId: account.clerkUserId,
    email: account.email,
    name: account.profile?.displayName ?? account.username,
  });

  await getPrisma().user.update({
    where: { id: account.id },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
}

/**
 * Retourne le statut premium courant pour afficher la page pricing.
 */
export async function getSubscriptionSummaryForClerkUser(clerkUserId: string | null) {
  if (!clerkUserId) {
    return {
      isAuthenticated: false,
      isPremium: false,
      commissionRateBp: DEFAULT_PLATFORM_COMMISSION_RATE_BP,
    };
  }

  const account = await syncCurrentAccountFromClerk();

  if (account.clerkUserId !== clerkUserId) {
    throw new Error("account_not_found");
  }

  const summary = await getSubscriptionSummaryForUserId(account.id);

  return {
    isAuthenticated: true,
    ...summary,
  };
}

export async function getSubscriptionSummaryForUserId(userId: string) {
  const [subscription, user] = await Promise.all([
    findLatestUniverseSubscription(userId),
    getPrisma().user.findUnique({
      where: { id: userId },
      select: { stripeCustomerId: true },
    }),
  ]);
  const isPremium = subscription
    ? isPremiumStatus(subscription.status, subscription.currentPeriodEnd)
    : false;

  return {
    isPremium,
    commissionRateBp: isPremium
      ? subscription?.plan.reducedCommissionRateBp ?? PREMIUM_PLATFORM_COMMISSION_RATE_BP
      : DEFAULT_PLATFORM_COMMISSION_RATE_BP,
    status: subscription?.status ?? "INACTIVE",
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
    canManageSubscription: Boolean(user?.stripeCustomerId),
  };
}

/**
 * Cree une session Checkout Stripe pour l'abonnement Universe.
 */
export async function createUniverseSubscriptionCheckoutForCurrentUser(
  clerkUserId: string,
  requestUrl: string,
) {
  const account = await syncCurrentAccountFromClerk();

  if (account.clerkUserId !== clerkUserId) {
    throw new Error("account_not_found");
  }

  const plan = await ensureUniverseMonthlyPlan();
  const customerId = await getOrCreateStripeCustomer(account);
  const origin = getPublicOrigin(requestUrl);
  const session = await createStripeSubscriptionCheckoutSession({
    customerId,
    userId: account.id,
    planCode: plan.code,
    priceId: plan.stripePriceId ?? getUniverseMonthlyPriceId(),
    successUrl: buildUrl(origin, "/pricing?subscription=success&stripeSessionId={CHECKOUT_SESSION_ID}"),
    cancelUrl: buildUrl(origin, "/pricing?subscription=cancelled"),
  });

  if (!session.url) {
    throw new Error("stripe_checkout_url_missing");
  }

  return {
    provider: "STRIPE" as const,
    checkoutSessionId: session.id,
    checkoutUrl: session.url,
  };
}

/**
 * Cree une session Customer Portal Stripe pour gerer l'abonnement.
 */
export async function createUniverseSubscriptionPortalForCurrentUser(
  clerkUserId: string,
  requestUrl: string,
) {
  const account = await syncCurrentAccountFromClerk();

  if (account.clerkUserId !== clerkUserId) {
    throw new Error("account_not_found");
  }

  if (!account.stripeCustomerId) {
    throw new Error("stripe_customer_missing");
  }

  const origin = getPublicOrigin(requestUrl);
  const session = await createStripeBillingPortalSession({
    customerId: account.stripeCustomerId,
    returnUrl: buildUrl(origin, "/pricing"),
  });
  if (!session.url) {
    throw new Error("stripe_portal_url_missing");
  }

  return {
    provider: "STRIPE" as const,
    portalUrl: session.url,
  };
}

/**
 * Synchronise une subscription Stripe dans le modele local.
 */
export async function syncStripeSubscription(subscription: SubscriptionLike) {
  const prisma = getPrisma();
  const metadataUserId = subscription.metadata.userId;
  const planCode = subscription.metadata.planCode || UNIVERSE_MONTHLY_PLAN_CODE;
  const customerId = stripeCustomerId(subscription.customer);
  const status = mapStripeSubscriptionStatus(subscription.status);
  const currentPeriodEnd = toDateFromUnix(subscription.current_period_end);
  const currentPeriodStart = toDateFromUnix(subscription.current_period_start);
  const canceledAt = toDateFromUnix(subscription.canceled_at);
  const user = metadataUserId
    ? await prisma.user.findUnique({ where: { id: metadataUserId }, select: { id: true } })
    : customerId
      ? await prisma.user.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } })
      : null;

  if (!user) {
    throw new Error("subscription_user_not_found");
  }

  const plan =
    (await prisma.subscriptionPlan.findFirst({
      where: {
        OR: [{ code: planCode }, { stripePriceId: getUniverseMonthlyPriceId() }],
      },
    })) ?? (await ensureUniverseMonthlyPlan());

  if (customerId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const savedSubscription = await prisma.userSubscription.upsert({
    where: { providerSubscriptionId: subscription.id },
    update: {
      userId: user.id,
      planId: plan.id,
      provider: "STRIPE",
      status,
      startedAt: currentPeriodStart ?? undefined,
      currentPeriodStart,
      currentPeriodEnd,
      canceledAt: canceledAt ?? (status === "CANCELED" ? new Date() : null),
    },
    create: {
      userId: user.id,
      planId: plan.id,
      provider: "STRIPE",
      providerSubscriptionId: subscription.id,
      status,
      startedAt: currentPeriodStart,
      currentPeriodStart,
      currentPeriodEnd,
      canceledAt: canceledAt ?? (status === "CANCELED" ? new Date() : null),
    },
  });

  if (isPremiumStatus(status, currentPeriodEnd)) {
    await emailService.sendSubscriptionStarted(subscription.id);
  } else {
    await emailService.sendSubscriptionEnded(subscription.id);
  }

  return savedSubscription;
}

/**
 * Marque localement une subscription comme en retard de paiement.
 */
export async function markStripeSubscriptionPaymentFailed(subscriptionId: string) {
  const subscription = await retrieveStripeSubscription(subscriptionId);

  return syncStripeSubscription(subscription as SubscriptionLike);
}

/**
 * Traite une session Checkout Billing terminee.
 */
export async function handleStripeSubscriptionCheckoutCompleted(session: Stripe.Checkout.Session) {
  const subscriptionId = stripeSubscriptionId(session.subscription);

  if (!subscriptionId) {
    throw new Error("stripe_subscription_missing");
  }

  const subscription = await retrieveStripeSubscription(subscriptionId);

  return syncStripeSubscription(subscription as SubscriptionLike);
}

export async function handleStripeSubscriptionInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = stripeSubscriptionId((invoice as InvoiceWithSubscription).subscription);

  if (!subscriptionId) {
    return null;
  }

  return markStripeSubscriptionPaymentFailed(subscriptionId);
}

export function isStripeSubscriptionCheckoutSession(session: Stripe.Checkout.Session) {
  return session.mode === "subscription" || session.metadata?.purpose === "universe_subscription";
}
