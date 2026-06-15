import "server-only";

export const DEFAULT_BEAT_CURRENCY = "EUR";
export const DEFAULT_PLATFORM_COMMISSION_RATE_BP = 3000;
export const DEFAULT_BASIC_LICENSE_CODE = "basic";
export const BEAT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_BEAT_TAGS = 12;

/**
 * Stripe tax code for electronically supplied services.
 * Keep this under product/fiscal review before go-live for beat licenses.
 */
export const STRIPE_DIGITAL_SERVICE_TAX_CODE = "txcd_10000000";
