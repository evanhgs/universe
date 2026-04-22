import "server-only";

import { getPrisma } from "@/lib/prisma";

import type { RoleCode } from "../../../generated/prisma/enums";
import type { UpdateAccountProfileInput } from "./account.types";

export const accountSelect = {
  id: true,
  clerkUserId: true,
  email: true,
  username: true,
  firstName: true,
  lastName: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
  profile: {
    select: {
      id: true,
      displayName: true,
      slug: true,
      bio: true,
      city: true,
      countryCode: true,
      isPublic: true,
    },
  },
  roles: {
    select: {
      role: true,
    },
    orderBy: {
      role: "asc",
    },
  },
} as const;

export async function findAccountByClerkUserId(clerkUserId: string) {
  return getPrisma().user.findUnique({
    where: { clerkUserId },
    select: accountSelect,
  });
}

export async function findAccountByEmail(email: string) {
  return getPrisma().user.findUnique({
    where: { email },
    select: {
      id: true,
      profile: {
        select: {
          slug: true,
        },
      },
    },
  });
}

export async function findAccountByProfileSlug(slug: string) {
  return getPrisma().userProfile.findUnique({
    where: { slug },
    select: {
      userId: true,
    },
  });
}

export async function upsertAccountIdentity(args: {
  clerkUserId: string;
  email: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  emailVerifiedAt: Date | null;
  profileDefaults: {
    displayName: string;
    slug: string;
  };
  defaultRole: RoleCode;
}) {
  return getPrisma().$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: {
        clerkUserId: args.clerkUserId,
      },
      update: {
        email: args.email,
        username: args.username,
        firstName: args.firstName,
        lastName: args.lastName,
        emailVerifiedAt: args.emailVerifiedAt,
        status: "ACTIVE",
        deletedAt: null,
      },
      create: {
        clerkUserId: args.clerkUserId,
        email: args.email,
        username: args.username,
        firstName: args.firstName,
        lastName: args.lastName,
        emailVerifiedAt: args.emailVerifiedAt,
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });

    await tx.userRoleAssignment.createMany({
      data: [{ userId: user.id, role: args.defaultRole }],
      skipDuplicates: true,
    });

    await tx.userProfile.upsert({
      where: {
        userId: user.id,
      },
      update: {},
      create: {
        userId: user.id,
        displayName: args.profileDefaults.displayName,
        slug: args.profileDefaults.slug,
      },
    });

    return tx.user.findUniqueOrThrow({
      where: {
        id: user.id,
      },
      select: accountSelect,
    });
  });
}

export async function updateAccountProfileByClerkUserId(args: {
  clerkUserId: string;
  profile: UpdateAccountProfileInput;
}) {
  return getPrisma().$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: {
        clerkUserId: args.clerkUserId,
      },
      select: {
        id: true,
      },
    });

    await tx.user.update({
      where: { id: user.id },
      data: {
        ...(args.profile.firstName !== undefined
          ? { firstName: args.profile.firstName }
          : {}),
        ...(args.profile.lastName !== undefined
          ? { lastName: args.profile.lastName }
          : {}),
        ...(args.profile.username !== undefined
          ? { username: args.profile.username }
          : {}),
      },
    });

    await tx.userProfile.update({
      where: { userId: user.id },
      data: {
        ...(args.profile.displayName !== undefined
          ? { displayName: args.profile.displayName ?? "Anonymous" }
          : {}),
        ...(args.profile.slug !== undefined ? { slug: args.profile.slug } : {}),
        ...(args.profile.bio !== undefined ? { bio: args.profile.bio } : {}),
        ...(args.profile.city !== undefined ? { city: args.profile.city } : {}),
        ...(args.profile.countryCode !== undefined
          ? { countryCode: args.profile.countryCode }
          : {}),
        ...(args.profile.isPublic !== undefined
          ? { isPublic: args.profile.isPublic }
          : {}),
      },
    });

    return tx.user.findUniqueOrThrow({
      where: { id: user.id },
      select: accountSelect,
    });
  });
}

export async function replaceSelfServiceRolesByClerkUserId(args: {
  clerkUserId: string;
  allowedRoles: RoleCode[];
  replaceWith: RoleCode[];
}) {
  return getPrisma().$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { clerkUserId: args.clerkUserId },
      select: { id: true },
    });

    await tx.userRoleAssignment.deleteMany({
      where: {
        userId: user.id,
        role: { in: args.allowedRoles },
      },
    });

    await tx.userRoleAssignment.createMany({
      data: args.replaceWith.map((role) => ({
        userId: user.id,
        role,
      })),
      skipDuplicates: true,
    });

    return tx.user.findUniqueOrThrow({
      where: { id: user.id },
      select: accountSelect,
    });
  });
}

export async function markAccountDeletedByClerkUserId(clerkUserId: string) {
  return getPrisma().user.updateMany({
    where: { clerkUserId },
    data: {
      clerkUserId: null,
      status: "DELETED",
      deletedAt: new Date(),
    },
  });
}
