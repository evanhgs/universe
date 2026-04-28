import "server-only";

import { syncCurrentAccountFromClerk } from "@/server/account/account.sync";
import { createProtectedAssetUrl } from "@/server/storage/s3";
import type Stripe from "stripe";

import { Prisma } from "../../../generated/prisma/client";
import {
  attachStripeSessionToPayment,
  createOrderForOffering,
  createPendingStripePayment,
  findActiveEntitlementForOffering,
  findBuyerOrder,
  findDownloadEntitlement,
  findLatestPendingStripePayment,
  findPurchasableOffering,
  findStripePaymentForConfirmation,
  incrementEntitlementDownloadCount,
  listBuyerOrders,
  listSellerOrderItems,
  markOrderPaidFromStripe,
  markStripePaymentFailedBySession,
} from "./marketplace.repository";
import { createStripeCheckoutSession, retrieveStripeCheckoutSession } from "./stripe.client";
import type {
  CreateDirectPurchaseOrderInput,
  MarketplaceAssetPayload,
  MarketplaceOrderPayload,
  StripeCheckoutInput,
  StripeConfirmationInput,
} from "./marketplace.types";

type OrderRecord = Awaited<ReturnType<typeof createOrderForOffering>>;

function decimalToNumber(value: Prisma.Decimal | number | null) {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value.toString());
}

function bigintToNumber(value: bigint | number | null) {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value);
}

function toCents(value: number) {
  return Math.round(value * 100);
}

function stripeObjectId(value: string | { id: string } | null) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : value.id;
}

function stripePayloadJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function serializeOrder(order: OrderRecord): MarketplaceOrderPayload {
  return {
    id: order.id,
    status: order.status,
    currency: order.currency,
    subtotalAmount: decimalToNumber(order.subtotalAmount) ?? 0,
    commissionAmount: decimalToNumber(order.commissionAmount) ?? 0,
    taxAmount: decimalToNumber(order.taxAmount) ?? 0,
    totalAmount: decimalToNumber(order.totalAmount) ?? 0,
    paidAt: order.paidAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      type: item.type,
      title: item.titleSnapshot,
      licenseName: item.licenseNameSnapshot,
      unitAmount: decimalToNumber(item.unitAmount) ?? 0,
      quantity: item.quantity,
      lineTotalAmount: decimalToNumber(item.lineTotalAmount) ?? 0,
      beat: item.beat
        ? {
            id: item.beat.id,
            slug: item.beat.slug,
            title: item.beat.title,
          }
        : null,
      seller: item.seller
        ? {
            id: item.seller.id,
            slug: item.seller.profile?.slug ?? null,
            displayName: item.seller.profile?.displayName ?? null,
          }
        : null,
    })),
    payments: order.payments.map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      status: payment.status,
      amount: decimalToNumber(payment.amount) ?? 0,
      currency: payment.currency,
      providerSessionId: payment.providerSessionId,
      paidAt: payment.paidAt?.toISOString() ?? null,
      createdAt: payment.createdAt.toISOString(),
    })),
    entitlements: order.entitlements.map((entitlement) => ({
      id: entitlement.id,
      status: entitlement.status,
      beatId: entitlement.beatId,
      beatLicenseOfferingId: entitlement.beatLicenseOfferingId,
      downloadLimit: entitlement.downloadLimit,
      downloadCount: entitlement.downloadCount,
      accessGrantedAt: entitlement.accessGrantedAt?.toISOString() ?? null,
      expiresAt: entitlement.expiresAt?.toISOString() ?? null,
    })),
  };
}

function buildCheckoutUrl(origin: string, path: string) {
  return new URL(path, origin).toString();
}

function buildDefaultCheckoutUrls(orderId: string, requestUrl: string) {
  const origin = new URL(requestUrl).origin;

  return {
    successUrl: buildCheckoutUrl(
      origin,
      `/account/purchases?orderId=${encodeURIComponent(orderId)}&stripeSessionId={CHECKOUT_SESSION_ID}`,
    ),
    cancelUrl: buildCheckoutUrl(
      origin,
      `/account/purchases?orderId=${encodeURIComponent(orderId)}&checkout=cancelled`,
    ),
  };
}

async function assertMarketplaceAccount(clerkUserId: string) {
  const account = await syncCurrentAccountFromClerk();

  if (account.clerkUserId !== clerkUserId) {
    throw new Error("account_not_found");
  }

  return account;
}

export async function createDirectPurchaseOrderForCurrentBuyer(
  clerkUserId: string,
  input: CreateDirectPurchaseOrderInput,
) {
  const account = await assertMarketplaceAccount(clerkUserId);
  const offering = await findPurchasableOffering(input);

  if (!offering) {
    throw new Error("beat_or_license_not_found");
  }

  if (offering.sellerId === account.id) {
    throw new Error("cannot_buy_own_beat");
  }

  const activeEntitlement = await findActiveEntitlementForOffering({
    buyerId: account.id,
    beatLicenseOfferingId: offering.id,
  });

  if (activeEntitlement) {
    throw new Error("already_purchased");
  }

  return serializeOrder(await createOrderForOffering({ buyerId: account.id, offering }));
}

export async function createStripeCheckoutForCurrentBuyer(
  clerkUserId: string,
  orderId: string,
  input: StripeCheckoutInput,
  requestUrl: string,
) {
  const account = await assertMarketplaceAccount(clerkUserId);
  const order = await findBuyerOrder(orderId, account.id);

  if (!order) {
    throw new Error("order_not_found");
  }

  if (order.status !== "PENDING_PAYMENT") {
    throw new Error("order_not_payable");
  }

  const totalAmount = decimalToNumber(order.totalAmount) ?? 0;
  const reusablePayment = await findLatestPendingStripePayment({
    orderId: order.id,
    buyerId: account.id,
  });

  if (reusablePayment?.providerSessionId) {
    const existingSession = await retrieveStripeCheckoutSession(
      reusablePayment.providerSessionId,
    );

    if (existingSession.status === "open" && existingSession.url) {
      return {
        orderId: order.id,
        paymentId: reusablePayment.id,
        provider: "STRIPE" as const,
        checkoutSessionId: existingSession.id,
        checkoutUrl: existingSession.url,
      };
    }
  }

  const payment = await createPendingStripePayment({
    orderId: order.id,
    buyerId: account.id,
    amount: totalAmount,
    currency: order.currency,
  });
  const defaults = buildDefaultCheckoutUrls(order.id, requestUrl);
  const session = await createStripeCheckoutSession({
    orderId: order.id,
    paymentId: payment.id,
    buyerId: account.id,
    amountCents: toCents(totalAmount),
    currency: order.currency,
    title: order.items.map((item) => item.titleSnapshot).join(", "),
    successUrl: input.successUrl ?? defaults.successUrl,
    cancelUrl: input.cancelUrl ?? defaults.cancelUrl,
  });

  if (!session.url) {
    throw new Error("stripe_checkout_url_missing");
  }

  await attachStripeSessionToPayment({
    paymentId: payment.id,
    providerSessionId: session.id,
    providerPaymentIntentId: stripeObjectId(session.payment_intent),
    payload: stripePayloadJson(session),
  });

  return {
    orderId: order.id,
    paymentId: payment.id,
    provider: "STRIPE" as const,
    checkoutSessionId: session.id,
    checkoutUrl: session.url,
  };
}

export async function confirmStripePaymentForCurrentBuyer(
  clerkUserId: string,
  orderId: string,
  input: StripeConfirmationInput,
) {
  const account = await assertMarketplaceAccount(clerkUserId);
  const payment = await findStripePaymentForConfirmation({
    orderId,
    buyerId: account.id,
    sessionId: input.sessionId,
  });

  if (!payment?.providerSessionId) {
    throw new Error("stripe_payment_not_found");
  }

  return fulfillStripeCheckoutSession(payment.providerSessionId);
}

export async function fulfillStripeCheckoutSession(sessionId: string) {
  const session = await retrieveStripeCheckoutSession(sessionId);
  const sessionOrderId = session.client_reference_id ?? session.metadata?.orderId;
  const paymentId = session.metadata?.paymentId;

  if (!sessionOrderId || !paymentId) {
    throw new Error("stripe_session_metadata_missing");
  }

  const payment = await findStripePaymentForConfirmation({
    orderId: sessionOrderId,
    buyerId: session.metadata?.buyerId ?? "",
    sessionId: session.id,
  });

  if (!payment || payment.id !== paymentId) {
    throw new Error("stripe_session_mismatch");
  }

  if (session.payment_status !== "paid") {
    throw new Error("stripe_session_not_paid");
  }

  const expectedAmount = toCents(decimalToNumber(payment.amount) ?? 0);

  if (
    session.amount_total !== expectedAmount ||
    session.currency?.toUpperCase() !== payment.currency
  ) {
    throw new Error("stripe_amount_mismatch");
  }

  return serializeOrder(
    await markOrderPaidFromStripe({
      orderId: payment.orderId,
      paymentId: payment.id,
      providerPaymentIntentId: stripeObjectId(session.payment_intent),
      payload: stripePayloadJson(session),
    }),
  );
}

export async function handleStripeCheckoutWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;

      return fulfillStripeCheckoutSession(session.id);
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const status = event.type === "checkout.session.expired" ? "CANCELED" : "FAILED";

      await markStripePaymentFailedBySession({
        providerSessionId: session.id,
        status,
        failureMessage: event.type,
        payload: stripePayloadJson(session),
      });

      return null;
    }
    default:
      return null;
  }
}

export async function listCurrentBuyerPurchases(clerkUserId: string) {
  const account = await assertMarketplaceAccount(clerkUserId);
  const orders = await listBuyerOrders(account.id);

  return orders.map(serializeOrder);
}

export async function listCurrentSellerSales(clerkUserId: string) {
  const account = await assertMarketplaceAccount(clerkUserId);
  const roles = account.roles.map(({ role }) => role);

  if (!roles.includes("SELLER")) {
    throw new Error("seller_role_required");
  }

  const items = await listSellerOrderItems(account.id);

  return items.map((item) => ({
    id: item.id,
    orderId: item.orderId,
    orderStatus: item.order.status,
    paymentStatus: item.order.payments[0]?.status ?? null,
    title: item.titleSnapshot,
    licenseName: item.licenseNameSnapshot,
    unitAmount: decimalToNumber(item.unitAmount) ?? 0,
    quantity: item.quantity,
    lineTotalAmount: decimalToNumber(item.lineTotalAmount) ?? 0,
    currency: item.order.currency,
    createdAt: item.createdAt.toISOString(),
    paidAt: item.order.paidAt?.toISOString() ?? null,
    beat: item.beat
      ? {
          id: item.beat.id,
          slug: item.beat.slug,
          title: item.beat.title,
        }
      : null,
  }));
}

function selectDownloadAsset(
  entitlement: NonNullable<Awaited<ReturnType<typeof findDownloadEntitlement>>>,
) {
  const licensedArchive = entitlement.beat?.assets.find(
    (link) =>
      link.role === "AUDIO_LICENSED_ARCHIVE" &&
      link.licenseOfferingId === entitlement.beatLicenseOfferingId,
  );

  return (
    licensedArchive ??
    entitlement.beat?.assets.find(
      (link) =>
        link.role === "AUDIO_SOURCE" &&
        link.licenseOfferingId === entitlement.beatLicenseOfferingId,
    )
  );
}

async function serializeDownloadAsset(
  link: NonNullable<ReturnType<typeof selectDownloadAsset>>,
): Promise<MarketplaceAssetPayload> {
  const signedUrl = await createProtectedAssetUrl({
    bucket: link.asset.bucket,
    objectKey: link.asset.objectKey,
  });

  return {
    id: link.asset.id,
    role: link.role,
    url: signedUrl.url,
    expiresIn: signedUrl.expiresIn,
    originalFilename: link.asset.originalFilename,
    mimeType: link.asset.mimeType,
    sizeBytes: bigintToNumber(link.asset.sizeBytes),
  };
}

export async function getDownloadAccessForCurrentBuyer(
  clerkUserId: string,
  entitlementId: string,
) {
  const account = await assertMarketplaceAccount(clerkUserId);
  const entitlement = await findDownloadEntitlement({
    entitlementId,
    buyerId: account.id,
  });

  if (!entitlement || !entitlement.beat) {
    throw new Error("entitlement_not_found");
  }

  if (entitlement.expiresAt && entitlement.expiresAt.getTime() <= Date.now()) {
    throw new Error("entitlement_expired");
  }

  if (
    entitlement.downloadLimit !== null &&
    entitlement.downloadCount >= entitlement.downloadLimit
  ) {
    throw new Error("download_limit_reached");
  }

  const assetLink = selectDownloadAsset(entitlement);

  if (!assetLink) {
    throw new Error("download_asset_not_found");
  }

  const downloadAsset = await serializeDownloadAsset(assetLink);

  await incrementEntitlementDownloadCount(entitlement.id);

  return {
    entitlement: {
      id: entitlement.id,
      status: entitlement.status,
      downloadLimit: entitlement.downloadLimit,
      downloadCount: entitlement.downloadCount + 1,
      accessGrantedAt: entitlement.accessGrantedAt?.toISOString() ?? null,
      expiresAt: entitlement.expiresAt?.toISOString() ?? null,
    },
    beat: {
      id: entitlement.beat.id,
      slug: entitlement.beat.slug,
      title: entitlement.beat.title,
    },
    download: {
      delivery: "protected_storage_reference" as const,
      asset: downloadAsset,
    },
  };
}
