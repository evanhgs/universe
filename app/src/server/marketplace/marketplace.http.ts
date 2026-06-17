import "server-only";

import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";

/**
 * Convertit une erreur marketplace en reponse JSON HTTP coherente.
 * @param error Erreur levee par les services marketplace ou Stripe.
 * @returns NextResponse avec code applicatif, message et statut HTTP adapte.
 */
export function marketplaceErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error.";
  const code = message.startsWith("stripe_error:") ? "stripe_error" : message;
  const status =
    code === "beat_forbidden" || code === "payout_forbidden"
      ? 403
      : code === "beat_or_license_not_found" ||
          code === "exclusive_license_not_found" ||
          code === "exclusive_offer_not_found" ||
          code === "promotion_not_found" ||
          code === "order_not_found" ||
          code === "stripe_payment_not_found" ||
          code === "entitlement_not_found" ||
          code === "download_asset_not_found"
        ? 404
        : code === "already_purchased" ||
            code === "cannot_buy_own_beat" ||
            code === "cannot_offer_own_beat" ||
            code === "exclusive_license_unavailable" ||
            code === "exclusive_offer_not_payable" ||
            code === "cart_empty" ||
            code === "mixed_currency_cart" ||
            code === "invalid_discount_total" ||
            code === "order_not_payable" ||
            code === "stripe_catalog_not_ready" ||
            code === "stripe_price_missing" ||
            code === "download_limit_reached" ||
            code === "entitlement_expired"
          ? 409
          : code === "stripe_session_not_paid"
            ? 402
            : code === "stripe_not_configured" || code === "stripe_webhook_not_configured"
              ? 503
              : 400;

  return NextResponse.json(
    {
      error: code,
      message,
    },
    {
      status,
      headers: PRIVATE_JSON_HEADERS,
    },
  );
}
