import "server-only";

import { currentUser } from "@clerk/nextjs/server";

import { DEFAULT_ACCOUNT_ROLE, PROFILE_SLUG_PATTERN } from "./account.constants";
import {
  findAccountByEmail,
  findAccountByProfileSlug,
  upsertAccountIdentity,
} from "./account.repository";
import type { NormalizedClerkAccount } from "./account.types";

/**
 * Selectionne l'email primaire Clerk, avec repli sur le premier email disponible.
 * @param user Fragment utilisateur Clerk contenant emails et primaryEmailAddressId.
 * @returns Email primaire complet avec son etat de verification.
 */
function getPrimaryEmailAddress(user: {
  emailAddresses: Array<{
    id: string;
    emailAddress: string;
    verification?: {
      status?: string | null;
    } | null;
  }>;
  primaryEmailAddressId: string | null;
}) {
  const primary =
    user.emailAddresses.find(
      (emailAddress) => emailAddress.id === user.primaryEmailAddressId,
    ) ?? user.emailAddresses[0];

  if (!primary) {
    throw new Error("The Clerk user has no email address.");
  }

  return primary;
}

/**
 * Transforme une chaine libre en slug profil compatible avec PROFILE_SLUG_PATTERN.
 * @param value Nom utilisateur, email local-part ou autre base textuelle.
 * @returns Slug public securise, ou "user" si la chaine ne donne rien de valide.
 */
function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return PROFILE_SLUG_PATTERN.test(normalized) ? normalized : "user";
}

/**
 * Construit le nom public initial d'un profil a partir des donnees Clerk.
 * @param account Compte Clerk normalise.
 * @returns Nom complet, username, prefixe email ou valeur par defaut.
 */
function buildDisplayName(account: NormalizedClerkAccount) {
  const fullName = [account.firstName, account.lastName].filter(Boolean).join(" ").trim();

  return fullName || account.username || account.email.split("@")[0] || "User";
}

/**
 * Reserve un slug de profil unique pour un compte synchronise depuis Clerk.
 * @param account Compte Clerk normalise contenant email et username.
 * @returns Slug existant associe a l'email ou nouveau slug disponible.
 */
export async function buildUniqueProfileSlug(account: NormalizedClerkAccount) {
  const existingByEmail = await findAccountByEmail(account.email);

  if (existingByEmail?.profile?.slug) {
    return existingByEmail.profile.slug;
  }

  const base = slugify(account.username ?? "") || slugify(account.email.split("@")[0] ?? "");
  const safeBase = base || "user";

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const slug = attempt === 0 ? safeBase : `${safeBase}-${attempt + 1}`;
    const existing = await findAccountByProfileSlug(slug);

    if (!existing) {
      return slug;
    }
  }

  return `${safeBase}-${Date.now()}`;
}

/**
 * Convertit le format utilisateur Clerk en structure interne unique.
 * @param user Donnees Clerk minimales avec identite et emails.
 * @returns Identite normalisee prete a etre upsertee en base.
 */
export function normalizeClerkAccount(user: {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  emailAddresses: Array<{
    id: string;
    emailAddress: string;
    verification?: {
      status?: string | null;
    } | null;
  }>;
  primaryEmailAddressId: string | null;
}) {
  const primaryEmail = getPrimaryEmailAddress(user);

  return {
    clerkUserId: user.id,
    email: primaryEmail.emailAddress.toLowerCase(),
    username: user.username ?? null,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    emailVerifiedAt:
      primaryEmail.verification?.status === "verified" ? new Date() : null,
  } satisfies NormalizedClerkAccount;
}

/**
 * Synchronise un compte local depuis des donnees Clerk deja normalisees.
 * @param account Identite Clerk normalisee.
 * @returns Compte local cree ou mis a jour avec profil et role par defaut.
 */
export async function syncAccountFromNormalizedClerkData(account: NormalizedClerkAccount) {
  return upsertAccountIdentity({
    ...account,
    defaultRole: DEFAULT_ACCOUNT_ROLE,
    profileDefaults: {
      displayName: buildDisplayName(account),
      slug: await buildUniqueProfileSlug(account),
    },
  });
}

/**
 * Recupere l'utilisateur Clerk de la requete courante et le synchronise localement.
 * @returns Compte local correspondant a la session Clerk active.
 */
export async function syncCurrentAccountFromClerk() {
  const user = await currentUser();

  if (!user) {
    throw new Error("No authenticated Clerk user found.");
  }

  return syncAccountFromNormalizedClerkData(normalizeClerkAccount(user));
}
