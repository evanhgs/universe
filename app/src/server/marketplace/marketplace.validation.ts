import "server-only";

import type {
  CreateDirectPurchaseOrderInput,
  StripeCheckoutInput,
  StripeConfirmationInput,
} from "./marketplace.types";

function normalizeOptionalString(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error("Expected a string value.");
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : undefined;
}

function assertPayloadObject(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid marketplace payload.");
  }

  return payload as Record<string, unknown>;
}

function parseAbsoluteUrl(value: unknown, field: string) {
  const normalized = normalizeOptionalString(value);

  if (!normalized) {
    return undefined;
  }

  try {
    const url = new URL(normalized);

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error();
    }

    return url.toString();
  } catch {
    throw new Error(`${field} must be an absolute http(s) URL.`);
  }
}

export function parseCreateDirectPurchaseOrderInput(
  payload: unknown,
): CreateDirectPurchaseOrderInput {
  const body = assertPayloadObject(payload);
  const beatSlug = normalizeOptionalString(body.beatSlug);
  const licenseOfferingId = normalizeOptionalString(body.licenseOfferingId);

  if (!beatSlug && !licenseOfferingId) {
    throw new Error("beatSlug or licenseOfferingId is required.");
  }

  return {
    beatSlug,
    licenseOfferingId,
  };
}

export function parseStripeCheckoutInput(payload: unknown): StripeCheckoutInput {
  if (payload === undefined || payload === null || payload === "") {
    return {};
  }

  const body = assertPayloadObject(payload);

  return {
    successUrl: parseAbsoluteUrl(body.successUrl, "successUrl"),
    cancelUrl: parseAbsoluteUrl(body.cancelUrl, "cancelUrl"),
  };
}

export function parseStripeConfirmationInput(payload: unknown): StripeConfirmationInput {
  if (payload === undefined || payload === null || payload === "") {
    return {};
  }

  const body = assertPayloadObject(payload);

  return {
    sessionId: normalizeOptionalString(body.sessionId),
  };
}
