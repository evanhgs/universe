import "server-only";

import type {
  CreateExclusiveOfferInput,
  CreateDirectPurchaseOrderInput,
  CreatePromotionInput,
  StripeCheckoutInput,
  StripeConfirmationInput,
  UpdateExclusiveOfferInput,
  UpdatePromotionInput,
} from "./marketplace.types";

/**
 * Normalise une chaine optionnelle pour les payloads marketplace.
 * @param value Valeur brute issue du JSON.
 * @returns Chaine trimmee ou undefined si absente/vide.
 */
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

function normalizeRequiredString(value: unknown, field: string) {
  const normalized = normalizeOptionalString(value);

  if (!normalized) {
    throw new Error(`${field} is required.`);
  }

  return normalized;
}

function normalizeOptionalNumber(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a number.`);
  }

  return value;
}

function normalizePositiveMoney(value: unknown, field: string) {
  const amount = normalizeOptionalNumber(value, field);

  if (amount === undefined || amount <= 0) {
    throw new Error(`${field} must be greater than 0.`);
  }

  return Math.round(amount * 100) / 100;
}

function normalizeOptionalPositiveInteger(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }

  return value;
}

function normalizeOptionalIsoDate(value: unknown, field: string) {
  const normalized = normalizeOptionalString(value);

  if (!normalized) {
    return undefined;
  }

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${field} must be an ISO date.`);
  }

  return date.toISOString();
}

function normalizeStringList(value: unknown, field: string) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }

  return Array.from(
    new Set(
      value.map((item) => normalizeRequiredString(item, field)),
    ),
  );
}

function normalizePromotionCode(value: unknown) {
  const normalized = normalizeOptionalString(value);

  return normalized?.toUpperCase();
}

/**
 * Verifie que le payload recu est un objet JSON simple.
 * @param payload Corps JSON brut.
 * @returns Payload caste en dictionnaire.
 */
function assertPayloadObject(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid marketplace payload.");
  }

  return payload as Record<string, unknown>;
}

/**
 * Valide une URL absolue http(s) optionnelle.
 * @param value Valeur brute a parser.
 * @param field Nom du champ utilise dans l'erreur.
 */
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

/**
 * Liste des origines autorisees comme cible de redirection Stripe checkout.
 * Lit APP_URL au moment de l'appel (et non au chargement du module) pour
 * permettre les overrides en test. Une chaine vide invalide rejette toutes
 * les redirections fournies par le client (fail-closed).
 */
function getAllowedRedirectOrigins(): Set<string> {
  const origins = new Set<string>();
  const raw = process.env.APP_URL?.trim();

  if (!raw) {
    return origins;
  }

  try {
    origins.add(new URL(raw).origin);
  } catch {
    // APP_URL is mis-configured; no origin is whitelisted.
  }

  return origins;
}

/**
 * Valide une URL de redirection Stripe et impose qu'elle pointe vers une
 * origine connue (audit C2 : sans cette verification, un attaquant peut
 * utiliser `successUrl=https://phishing.example` pour rediriger l'acheteur
 * apres paiement).
 */
function parseRedirectUrl(value: unknown, field: string) {
  const url = parseAbsoluteUrl(value, field);

  if (!url) {
    return undefined;
  }

  const allowed = getAllowedRedirectOrigins();

  if (allowed.size === 0) {
    throw new Error(`${field} cannot be validated: APP_URL is not configured.`);
  }

  if (!allowed.has(new URL(url).origin)) {
    throw new Error(`${field} origin is not allowed.`);
  }

  return url;
}

/**
 * Valide la demande de creation de commande marketplace.
 * @param payload Corps JSON contenant beatSlug ou licenseOfferingId.
 * @returns Criteres d'achat normalises.
 */
export function parseCreateDirectPurchaseOrderInput(
  payload: unknown,
): CreateDirectPurchaseOrderInput {
  const body = assertPayloadObject(payload);
  const beatSlug = normalizeOptionalString(body.beatSlug);
  const licenseOfferingId = normalizeOptionalString(body.licenseOfferingId);
  const exclusiveOfferId = normalizeOptionalString(body.exclusiveOfferId);
  const promotionCode = normalizePromotionCode(body.promotionCode);
  const items = body.items === undefined
    ? undefined
    : (() => {
        if (!Array.isArray(body.items) || body.items.length === 0) {
          throw new Error("items must be a non-empty array.");
        }

        return body.items.map((item, index) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            throw new Error(`items.${index} must be an object.`);
          }

          const row = item as Record<string, unknown>;

          return {
            licenseOfferingId: normalizeRequiredString(
              row.licenseOfferingId,
              `items.${index}.licenseOfferingId`,
            ),
            quantity: normalizeOptionalPositiveInteger(row.quantity, `items.${index}.quantity`) ?? 1,
          };
        });
      })();

  const criteriaCount = [beatSlug || licenseOfferingId, exclusiveOfferId, items].filter(Boolean).length;

  if (criteriaCount !== 1) {
    throw new Error("Provide exactly one purchase target.");
  }

  return {
    beatSlug,
    licenseOfferingId,
    exclusiveOfferId,
    items,
    promotionCode,
  };
}

export function parseCreateExclusiveOfferInput(payload: unknown): CreateExclusiveOfferInput {
  const body = assertPayloadObject(payload);

  return {
    beatLicenseOfferingId: normalizeRequiredString(
      body.beatLicenseOfferingId,
      "beatLicenseOfferingId",
    ),
    proposedAmount: normalizePositiveMoney(body.proposedAmount, "proposedAmount"),
    buyerMessage: normalizeOptionalString(body.buyerMessage),
  };
}

export function parseUpdateExclusiveOfferInput(payload: unknown): UpdateExclusiveOfferInput {
  const body = assertPayloadObject(payload);
  const action = normalizeRequiredString(body.action, "action");

  if (!["accept", "reject", "counter"].includes(action)) {
    throw new Error("action must be accept, reject or counter.");
  }

  return {
    action: action as UpdateExclusiveOfferInput["action"],
    counterAmount: action === "counter"
      ? normalizePositiveMoney(body.counterAmount, "counterAmount")
      : undefined,
    sellerMessage: normalizeOptionalString(body.sellerMessage),
  };
}

export function parseCreatePromotionInput(payload: unknown): CreatePromotionInput {
  const body = assertPayloadObject(payload);
  const type = normalizeRequiredString(body.type, "type");
  const discountType = normalizeRequiredString(body.discountType, "discountType");
  const discountValue = normalizePositiveMoney(body.discountValue, "discountValue");
  const scope = body.scope && typeof body.scope === "object" && !Array.isArray(body.scope)
    ? body.scope as Record<string, unknown>
    : undefined;

  if (!["COUPON", "BUNDLE"].includes(type)) {
    throw new Error("type must be COUPON or BUNDLE.");
  }

  if (!["PERCENT", "FIXED"].includes(discountType)) {
    throw new Error("discountType must be PERCENT or FIXED.");
  }

  if (discountType === "PERCENT" && discountValue > 100) {
    throw new Error("discountValue cannot exceed 100 for percent discounts.");
  }

  return {
    type: type as CreatePromotionInput["type"],
    discountType: discountType as CreatePromotionInput["discountType"],
    title: normalizeRequiredString(body.title, "title"),
    code: normalizePromotionCode(body.code),
    discountValue,
    currency: normalizeOptionalString(body.currency)?.toUpperCase(),
    minItems: normalizeOptionalPositiveInteger(body.minItems, "minItems") ?? 1,
    usageLimit: normalizeOptionalPositiveInteger(body.usageLimit, "usageLimit"),
    startsAt: normalizeOptionalIsoDate(body.startsAt, "startsAt"),
    endsAt: normalizeOptionalIsoDate(body.endsAt, "endsAt"),
    scope: scope
      ? {
          beatIds: normalizeStringList(scope.beatIds, "scope.beatIds"),
          licenseOfferingIds: normalizeStringList(
            scope.licenseOfferingIds,
            "scope.licenseOfferingIds",
          ),
        }
      : undefined,
  };
}

export function parseUpdatePromotionInput(payload: unknown): UpdatePromotionInput {
  const body = assertPayloadObject(payload);
  const normalized = parseCreatePromotionInput({
    ...body,
    type: body.type ?? "COUPON",
    discountType: body.discountType ?? "PERCENT",
    title: body.title ?? "Promotion",
    discountValue: body.discountValue ?? 1,
  });

  return {
    ...(body.type === undefined ? {} : { type: normalized.type }),
    ...(body.discountType === undefined ? {} : { discountType: normalized.discountType }),
    ...(body.title === undefined ? {} : { title: normalized.title }),
    ...(body.code === undefined ? {} : { code: normalized.code }),
    ...(body.discountValue === undefined ? {} : { discountValue: normalized.discountValue }),
    ...(body.currency === undefined ? {} : { currency: normalized.currency }),
    ...(body.minItems === undefined ? {} : { minItems: normalized.minItems }),
    ...(body.usageLimit === undefined ? {} : { usageLimit: normalized.usageLimit }),
    ...(body.startsAt === undefined ? {} : { startsAt: normalized.startsAt }),
    ...(body.endsAt === undefined ? {} : { endsAt: normalized.endsAt }),
    ...(body.scope === undefined ? {} : { scope: normalized.scope }),
    ...(body.isActive === undefined ? {} : { isActive: body.isActive === true }),
  };
}

/**
 * Valide les options facultatives de creation Stripe Checkout.
 * @param payload Corps JSON optionnel contenant successUrl/cancelUrl.
 * @returns URLs absolues normalisees ou objet vide.
 */
export function parseStripeCheckoutInput(payload: unknown): StripeCheckoutInput {
  if (payload === undefined || payload === null || payload === "") {
    return {};
  }

  const body = assertPayloadObject(payload);

  return {
    successUrl: parseRedirectUrl(body.successUrl, "successUrl"),
    cancelUrl: parseRedirectUrl(body.cancelUrl, "cancelUrl"),
  };
}

/**
 * Valide le payload de confirmation Stripe Checkout.
 * @param payload Corps JSON optionnel contenant sessionId.
 * @returns Identifiant session normalise si fourni.
 */
export function parseStripeConfirmationInput(payload: unknown): StripeConfirmationInput {
  if (payload === undefined || payload === null || payload === "") {
    return {};
  }

  const body = assertPayloadObject(payload);

  return {
    sessionId: normalizeOptionalString(body.sessionId),
  };
}
