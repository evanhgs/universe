import "server-only";

import type {
  CreateDirectPurchaseOrderInput,
  StripeCheckoutInput,
  StripeConfirmationInput,
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

  if (!beatSlug && !licenseOfferingId) {
    throw new Error("beatSlug or licenseOfferingId is required.");
  }

  return {
    beatSlug,
    licenseOfferingId,
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
