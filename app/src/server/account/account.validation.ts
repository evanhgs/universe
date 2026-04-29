import "server-only";

import {
  PROFILE_SLUG_PATTERN,
  SELF_SERVICE_ROLE_CODES,
  USERNAME_PATTERN,
  type SelfServiceRoleCode,
} from "./account.constants";
import type { UpdateAccountProfileInput } from "./account.types";

/**
 * Normalise une valeur texte optionnelle provenant d'un payload JSON.
 * @param value Valeur inconnue a accepter comme undefined, null ou string.
 * @returns Chaine trimmee, null si vide, ou undefined si absente.
 */
function normalizeOptionalString(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("Expected a string value.");
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

/**
 * Refuse explicitement les champs requis envoyes vides.
 * @param value Valeur deja normalisee.
 * @param field Nom du champ utilise dans le message d'erreur.
 * @returns La valeur si elle est absente ou non vide.
 */
function requireNonEmptyString(value: string | null | undefined, field: string) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    throw new Error(`${field} cannot be empty.`);
  }

  return value;
}

/**
 * Valide et normalise le payload de mise a jour du profil courant.
 * @param payload Corps JSON brut recu par l'API account/me/profile.
 * @returns Champs de profil autorises, tailles controlees et formats normalises.
 */
export function parseProfileUpdateInput(payload: unknown): UpdateAccountProfileInput {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid profile payload.");
  }

  const body = payload as Record<string, unknown>;
  const firstName = requireNonEmptyString(
    normalizeOptionalString(body.firstName),
    "firstName",
  );
  const lastName = requireNonEmptyString(
    normalizeOptionalString(body.lastName),
    "lastName",
  );
  const username = requireNonEmptyString(
    normalizeOptionalString(body.username),
    "username",
  );
  const displayName = requireNonEmptyString(
    normalizeOptionalString(body.displayName),
    "displayName",
  );
  const slug = requireNonEmptyString(normalizeOptionalString(body.slug), "slug");
  const bio = normalizeOptionalString(body.bio);
  const city = normalizeOptionalString(body.city);
  const countryCode = normalizeOptionalString(body.countryCode);

  if (
    body.isPublic !== undefined &&
    body.isPublic !== null &&
    typeof body.isPublic !== "boolean"
  ) {
    throw new Error("isPublic must be a boolean.");
  }

  if (firstName !== undefined && firstName !== null && firstName.length > 80) {
    throw new Error("firstName is too long.");
  }

  if (lastName !== undefined && lastName !== null && lastName.length > 80) {
    throw new Error("lastName is too long.");
  }

  if (username !== undefined && username !== null && !USERNAME_PATTERN.test(username)) {
    throw new Error("username is invalid.");
  }

  if (displayName !== undefined && displayName !== null && displayName.length > 120) {
    throw new Error("displayName is too long.");
  }

  if (slug !== undefined && slug !== null && !PROFILE_SLUG_PATTERN.test(slug)) {
    throw new Error("slug is invalid.");
  }

  if (bio !== undefined && bio !== null && bio.length > 500) {
    throw new Error("bio is too long.");
  }

  if (city !== undefined && city !== null && city.length > 120) {
    throw new Error("city is too long.");
  }

  if (
    countryCode !== undefined &&
    countryCode !== null &&
    !/^[A-Z]{2}$/.test(countryCode.toUpperCase())
  ) {
    throw new Error("countryCode must be a 2-letter ISO code.");
  }

  return {
    ...(firstName !== undefined ? { firstName } : {}),
    ...(lastName !== undefined ? { lastName } : {}),
    ...(username !== undefined ? { username } : {}),
    ...(displayName !== undefined ? { displayName } : {}),
    ...(slug !== undefined ? { slug } : {}),
    ...(bio !== undefined ? { bio } : {}),
    ...(city !== undefined ? { city } : {}),
    ...(countryCode !== undefined
      ? { countryCode: countryCode ? countryCode.toUpperCase() : null }
      : {}),
    ...(body.isPublic !== undefined ? { isPublic: Boolean(body.isPublic) } : {}),
  };
}

/**
 * Valide la liste des roles que l'utilisateur peut s'assigner lui-meme.
 * @param payload Corps JSON contenant roles: string[].
 * @returns Roles dedoublonnes, uppercases et limites a SELF_SERVICE_ROLE_CODES.
 */
export function parseSelfServiceRoles(payload: unknown): SelfServiceRoleCode[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid roles payload.");
  }

  const roles = (payload as { roles?: unknown }).roles;

  if (!Array.isArray(roles)) {
    throw new Error("roles must be an array.");
  }

  const normalized = Array.from(
    new Set(
      roles.map((role) => {
        if (typeof role !== "string") {
          throw new Error("roles must only contain strings.");
        }

        return role.trim().toUpperCase();
      }),
    ),
  );

  if (normalized.length === 0) {
    throw new Error("At least one role is required.");
  }

  for (const role of normalized) {
    if (!SELF_SERVICE_ROLE_CODES.includes(role as SelfServiceRoleCode)) {
      throw new Error(`Role "${role}" cannot be self-assigned.`);
    }
  }

  return normalized as SelfServiceRoleCode[];
}
