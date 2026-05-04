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
  countPaidSellerOrderItemsByBeat,
  listSellerBeats,
  listBuyerOrders,
  listSellerRevenueLedgerEntries,
  listSellerOrderItems,
  markOrderPaidFromStripe,
  markStripePaymentFailedBySession,
} from "./marketplace.repository";
import { createStripeCheckoutSession, retrieveStripeCheckoutSession } from "./stripe.client";
import type {
  CreateDirectPurchaseOrderInput,
  MarketplaceAssetPayload,
  SellerDashboardPayload,
  MarketplaceOrderPayload,
  StripeCheckoutInput,
  StripeConfirmationInput,
} from "./marketplace.types";

type OrderRecord = Awaited<ReturnType<typeof createOrderForOffering>>;

/**
 * Convertit un Decimal Prisma en number nullable pour les payloads JSON.
 * @param value Montant Decimal, number ou null.
 */
function decimalToNumber(value: Prisma.Decimal | number | null) {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value.toString());
}

/**
 * Convertit un bigint Prisma en number nullable pour les tailles de fichiers.
 * @param value Taille bigint, number ou null.
 */
function bigintToNumber(value: bigint | number | null) {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value);
}

/**
 * Convertit un montant decimal en centimes Stripe.
 * @param value Montant dans la devise majeure.
 */
function toCents(value: number) {
  return Math.round(value * 100);
}

/**
 * Convertit des centimes Stripe vers un montant decimal.
 * @param value Montant en unite mineure Stripe.
 */
function fromCents(value: number) {
  return Math.round(value) / 100;
}

/**
 * Extrait l'id d'un objet Stripe qui peut etre une chaine ou un objet expand.
 * @param value Id Stripe, objet { id }, ou null.
 */
function stripeObjectId(value: string | { id: string } | null) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : value.id;
}

/**
 * Convertit un payload Stripe en JSON compatible Prisma.
 * @param value Payload fournisseur a persister.
 */
function stripePayloadJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * Transforme une commande Prisma en payload API marketplace.
 * @param order Commande chargee avec items, paiements et entitlements.
 */
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
      beatLicenseOfferingId: item.beatLicenseOfferingId,
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

/**
 * Construit une URL absolue de checkout a partir d'une origine publique.
 * @param origin Origine publique de l'application.
 * @param path Chemin applicatif cible.
 */
function buildCheckoutUrl(origin: string, path: string) {
  return new URL(path, origin).toString();
}

/**
 * Determine l'origine publique a utiliser pour les URLs de retour Stripe.
 * @param requestUrl URL de la requete courante.
 */
function getPublicCheckoutOrigin(requestUrl: string) {
  const appUrl = process.env.APP_URL;

  if (appUrl) {
    return new URL(appUrl).origin;
  }

  const requestOrigin = new URL(requestUrl).origin;

  if (requestOrigin === "http://0.0.0.0:3000") {
    return "http://localhost:3000";
  }

  return requestOrigin;
}

/**
 * Cree les URLs success/cancel par defaut pour une commande Stripe.
 * @param orderId Identifiant commande.
 * @param requestUrl URL de la requete courante.
 */
function buildDefaultCheckoutUrls(orderId: string, requestUrl: string) {
  const origin = getPublicCheckoutOrigin(requestUrl);

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

/**
 * Synchronise le compte courant et verifie qu'il correspond a l'utilisateur Clerk attendu.
 * @param clerkUserId Identifiant Clerk issu de auth().
 */
async function assertMarketplaceAccount(clerkUserId: string) {
  const account = await syncCurrentAccountFromClerk();

  if (account.clerkUserId !== clerkUserId) {
    throw new Error("account_not_found");
  }

  return account;
}

/**
 * Cree une commande d'achat direct pour l'acheteur authentifie.
 * @param clerkUserId Identifiant Clerk de l'acheteur.
 * @param input Beat ou offre de licence demandee.
 */
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

/**
 * Cree ou reutilise une session Stripe Checkout pour une commande de l'acheteur.
 * @param clerkUserId Identifiant Clerk de l'acheteur.
 * @param orderId Identifiant commande locale.
 * @param input URLs success/cancel optionnelles.
 * @param requestUrl URL de la requete entrante pour construire les URLs par defaut.
 */
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

/**
 * Confirme un paiement Stripe pour l'acheteur authentifie.
 * @param clerkUserId Identifiant Clerk de l'acheteur.
 * @param orderId Identifiant commande.
 * @param input Session Stripe a confirmer.
 */
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

/**
 * Confirme une session Stripe anonyme en verifiant qu'elle correspond a l'ordre demande.
 * @param orderId Identifiant commande attendu dans l'URL.
 * @param input Session Stripe retournee par Checkout.
 */
export async function confirmStripeCheckoutSessionForOrder(
  orderId: string,
  input: StripeConfirmationInput,
) {
  if (!input.sessionId) {
    throw new Error("stripe_payment_not_found");
  }

  const order = await fulfillStripeCheckoutSession(input.sessionId);

  if (order.id !== orderId) {
    throw new Error("stripe_session_mismatch");
  }

  return order;
}

/**
 * Verifie une session Checkout Stripe puis marque la commande payee si montants/devise concordent.
 * @param sessionId Identifiant Stripe Checkout Session.
 */
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

  const expectedSubtotal = toCents(decimalToNumber(payment.order.subtotalAmount) ?? 0);
  const stripeSubtotal = session.amount_subtotal ?? session.amount_total;
  const stripeTotal = session.amount_total ?? stripeSubtotal;

  if (stripeSubtotal === null || stripeTotal === null) {
    throw new Error("stripe_amount_missing");
  }

  if (
    stripeSubtotal !== expectedSubtotal ||
    session.currency?.toUpperCase() !== payment.currency
  ) {
    throw new Error("stripe_amount_mismatch");
  }

  const taxAmount = fromCents(session.total_details?.amount_tax ?? stripeTotal - stripeSubtotal);
  const totalAmount = fromCents(stripeTotal);

  return serializeOrder(
    await markOrderPaidFromStripe({
      orderId: payment.orderId,
      paymentId: payment.id,
      providerPaymentIntentId: stripeObjectId(session.payment_intent),
      taxAmount,
      totalAmount,
      payload: stripePayloadJson(session),
    }),
  );
}

/**
 * Route les evenements webhook Stripe Checkout vers fulfillment ou echec de paiement.
 * @param event Evenement Stripe deja verifie par signature.
 */
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

/**
 * Liste les achats de l'acheteur authentifie.
 * @param clerkUserId Identifiant Clerk de l'acheteur.
 */
export async function listCurrentBuyerPurchases(clerkUserId: string) {
  const account = await assertMarketplaceAccount(clerkUserId);
  const orders = await listBuyerOrders(account.id);

  return orders.map(serializeOrder);
}

/**
 * Liste les ventes visibles par le vendeur authentifie.
 * @param clerkUserId Identifiant Clerk du vendeur.
 */
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

/**
 * Agrege les donnees V1 du dashboard vendeur: ventes, revenus et instrumentales.
 * @param clerkUserId Identifiant Clerk du vendeur.
 */
export async function getCurrentSellerDashboard(
  clerkUserId: string,
): Promise<SellerDashboardPayload> {
  const account = await assertMarketplaceAccount(clerkUserId);
  const roles = account.roles.map(({ role }) => role);

  if (!roles.includes("SELLER")) {
    throw new Error("seller_role_required");
  }

  const [items, beats, paidCounts, ledgerEntries] = await Promise.all([
    listSellerOrderItems(account.id),
    listSellerBeats(account.id),
    countPaidSellerOrderItemsByBeat(account.id),
    listSellerRevenueLedgerEntries(account.id),
  ]);
  const sales = items.map((item) => ({
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
  const paidCountByBeatId = new Map(
    paidCounts
      .filter((item) => item.beatId)
      .map((item) => [item.beatId as string, item._count._all]),
  );
  const revenueByCurrency = new Map<
    string,
    {
      currency: string;
      grossPaidAmount: number;
      platformCommissionAmount: number;
      sellerEarningAmount: number;
    }
  >();

  for (const entry of ledgerEntries) {
    const current =
      revenueByCurrency.get(entry.currency) ??
      {
        currency: entry.currency,
        grossPaidAmount: 0,
        platformCommissionAmount: 0,
        sellerEarningAmount: 0,
      };
    const amount = decimalToNumber(entry.amount) ?? 0;

    if (entry.type === "GROSS_SALE") {
      current.grossPaidAmount += amount;
    } else if (entry.type === "PLATFORM_COMMISSION") {
      current.platformCommissionAmount += Math.abs(amount);
    } else if (entry.type === "SELLER_EARNING") {
      current.sellerEarningAmount += amount;
    }

    revenueByCurrency.set(entry.currency, current);
  }

  return {
    items: sales,
    count: sales.length,
    summary: {
      paidSalesCount: sales.filter((sale) => sale.orderStatus === "PAID").length,
      orderLineCount: sales.length,
      beatCount: beats.length,
      publishedBeatCount: beats.filter((beat) => beat.status === "PUBLISHED").length,
      draftBeatCount: beats.filter((beat) => beat.status === "DRAFT").length,
      processingBeatCount: beats.filter((beat) => beat.status === "PROCESSING").length,
      hiddenBeatCount: beats.filter((beat) => beat.status === "HIDDEN").length,
      revenueByCurrency: Array.from(revenueByCurrency.values()),
    },
    beats: beats.map((beat) => ({
      id: beat.id,
      slug: beat.slug,
      title: beat.title,
      status: beat.status,
      visibility: beat.visibility,
      priceAmount: decimalToNumber(beat.basePriceAmount),
      currency: beat.currency,
      publishedAt: beat.publishedAt?.toISOString() ?? null,
      updatedAt: beat.updatedAt.toISOString(),
      paidSalesCount: paidCountByBeatId.get(beat.id) ?? 0,
    })),
  };
}

/**
 * Choisit l'asset telechargeable correspondant a l'entitlement et a son offre de licence.
 * @param entitlement Entitlement charge avec beat et liens d'assets.
 */
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

/**
 * Genere le payload de telechargement protege pour un lien d'asset.
 * @param link Lien beat-asset selectionne.
 */
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

/**
 * Genere un acces de telechargement pour l'acheteur, en appliquant expiration et limite.
 * @param clerkUserId Identifiant Clerk de l'acheteur.
 * @param entitlementId Identifiant du droit d'achat.
 */
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
