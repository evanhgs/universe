import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

import {
  SELF_SERVICE_ROLE_CODES,
  USERNAME_PATTERN,
  type SelfServiceRoleCode,
} from "./account.constants";
import {
  findAccountByClerkUserId,
  markAccountDeletedByClerkUserId,
  replaceSelfServiceRolesByClerkUserId,
  updateAccountProfileByClerkUserId,
} from "./account.repository";
import {
  normalizeClerkAccount,
  syncAccountFromNormalizedClerkData,
  syncCurrentAccountFromClerk,
} from "./account.sync";
import type { AccountSnapshot, UpdateAccountProfileInput } from "./account.types";

type PersistedAccount = Awaited<ReturnType<typeof findAccountByClerkUserId>>;

/**
 * Convertit un compte Prisma en payload API stable pour le frontend.
 * @param account Compte persistant avec profil et roles deja charges.
 * @returns Snapshot serialise avec dates ISO et roles aplatis.
 */
function serializeAccount(account: NonNullable<PersistedAccount>): AccountSnapshot {
  if (!account.profile) {
    throw new Error("The account profile is missing.");
  }

  return {
    user: {
      id: account.id,
      clerkUserId: account.clerkUserId ?? "",
      email: account.email,
      username: account.username,
      firstName: account.firstName,
      lastName: account.lastName,
      status: account.status,
      emailVerifiedAt: account.emailVerifiedAt?.toISOString() ?? null,
      createdAt: account.createdAt.toISOString(),
      updatedAt: account.updatedAt.toISOString(),
    },
    profile: {
      id: account.profile.id,
      displayName: account.profile.displayName,
      slug: account.profile.slug,
      bio: account.profile.bio,
      city: account.profile.city,
      countryCode: account.profile.countryCode,
      isPublic: account.profile.isPublic,
    },
    roles: account.roles.map(({ role }) => role),
  };
}

/**
 * Synchronise l'utilisateur Clerk courant puis retourne son snapshot local.
 * @returns Compte local de l'utilisateur authentifie.
 */
export async function getCurrentAccountSnapshot() {
  return serializeAccount(await syncCurrentAccountFromClerk());
}

/**
 * Met a jour les champs de profil du compte courant et les champs Clerk associes.
 * @param clerkUserId Identifiant Clerk de l'utilisateur authentifie.
 * @param input Champs de profil valides par parseProfileUpdateInput.
 * @returns Snapshot du compte apres ecriture locale et Clerk.
 */
export async function updateCurrentAccountProfile(
  clerkUserId: string,
  input: UpdateAccountProfileInput,
) {
  const client = await clerkClient();

  if (input.username !== undefined && input.username !== null && !USERNAME_PATTERN.test(input.username)) {
    throw new Error("username is invalid.");
  }

  if (
    input.firstName !== undefined ||
    input.lastName !== undefined ||
    input.username !== undefined
  ) {
    await client.users.updateUser(clerkUserId, {
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.username !== undefined ? { username: input.username } : {}),
    });
  }

  const account = await updateAccountProfileByClerkUserId({
    clerkUserId,
    profile: input,
  });

  return serializeAccount(account);
}

/**
 * Remplace les roles self-service du compte courant et les publie dans les metadata Clerk.
 * @param clerkUserId Identifiant Clerk de l'utilisateur authentifie.
 * @param roles Roles self-service autorises, typiquement BUYER et/ou SELLER.
 * @returns Snapshot du compte avec la liste finale des roles.
 */
export async function updateCurrentAccountRoles(
  clerkUserId: string,
  roles: SelfServiceRoleCode[],
) {
  const client = await clerkClient();
  const account = await replaceSelfServiceRolesByClerkUserId({
    clerkUserId,
    allowedRoles: [...SELF_SERVICE_ROLE_CODES],
    replaceWith: roles,
  });

  await client.users.updateUserMetadata(clerkUserId, {
    publicMetadata: {
      marketplaceRoles: roles,
    },
  });

  return serializeAccount(account);
}

/**
 * Normalise un payload webhook Clerk user.created/user.updated puis synchronise le compte local.
 * @param payload Donnees utilisateur Clerk en format snake_case ou camelCase.
 * @returns Compte persistant synchronise.
 */
export async function syncAccountFromClerkWebhookPayload(payload: {
  id: string;
  username: string | null;
  first_name?: string | null;
  last_name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email_addresses?: Array<{
    id: string;
    email_address: string;
    verification?: {
      status?: string | null;
    } | null;
  }>;
  emailAddresses?: Array<{
    id: string;
    emailAddress: string;
    verification?: {
      status?: string | null;
    } | null;
  }>;
  primary_email_address_id?: string | null;
  primaryEmailAddressId?: string | null;
}) {
  const normalized = normalizeClerkAccount({
    id: payload.id,
    username: payload.username ?? null,
    firstName: payload.firstName ?? payload.first_name ?? null,
    lastName: payload.lastName ?? payload.last_name ?? null,
    emailAddresses:
      payload.emailAddresses ??
      payload.email_addresses?.map((emailAddress) => ({
        id: emailAddress.id,
        emailAddress: emailAddress.email_address,
        verification: emailAddress.verification ?? null,
      })) ??
      [],
    primaryEmailAddressId:
      payload.primaryEmailAddressId ?? payload.primary_email_address_id ?? null,
  });

  return syncAccountFromNormalizedClerkData(normalized);
}

/**
 * Traite un webhook Clerk user.deleted en detachant l'identite Clerk du compte local.
 * @param clerkUserId Identifiant Clerk supprime.
 */
export async function deleteAccountFromClerkWebhook(clerkUserId: string) {
  await markAccountDeletedByClerkUserId(clerkUserId);
}
