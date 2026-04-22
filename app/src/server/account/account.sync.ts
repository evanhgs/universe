import "server-only";

import { currentUser } from "@clerk/nextjs/server";

import { DEFAULT_ACCOUNT_ROLE, PROFILE_SLUG_PATTERN } from "./account.constants";
import {
  findAccountByEmail,
  findAccountByProfileSlug,
  upsertAccountIdentity,
} from "./account.repository";
import type { NormalizedClerkAccount } from "./account.types";

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

function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return PROFILE_SLUG_PATTERN.test(normalized) ? normalized : "user";
}

function buildDisplayName(account: NormalizedClerkAccount) {
  const fullName = [account.firstName, account.lastName].filter(Boolean).join(" ").trim();

  return fullName || account.username || account.email.split("@")[0] || "User";
}

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

export async function syncCurrentAccountFromClerk() {
  const user = await currentUser();

  if (!user) {
    throw new Error("No authenticated Clerk user found.");
  }

  return syncAccountFromNormalizedClerkData(normalizeClerkAccount(user));
}
