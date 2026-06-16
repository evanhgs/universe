import "server-only";

import { getPrisma } from "@/lib/prisma";

import type { RoleCode } from "../../../generated/prisma/enums";
import type { UpdateAccountProfileInput } from "./account.types";

export const accountSelect = {
  id: true,
  clerkUserId: true,
  email: true,
  stripeCustomerId: true,
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

/**
 * Charge le compte persistant correspondant a un utilisateur Clerk.
 * @param clerkUserId Identifiant utilisateur fourni par Clerk.
 * @returns Le compte, son profil et ses roles, ou null si aucun compte local n'existe.
 */
export async function findAccountByClerkUserId(clerkUserId: string) {
  return getPrisma().user.findUnique({
    where: { clerkUserId },
    select: accountSelect,
  });
}

/**
 * Recherche un compte local par email afin de reutiliser un profil existant pendant la synchronisation Clerk.
 * @param email Email normalise en base.
 * @returns L'identifiant du compte et le slug de profil associe, ou null.
 */
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

/**
 * Verifie si un slug de profil est deja attribue.
 * @param slug Slug public du profil.
 * @returns L'identifiant utilisateur proprietaire du profil, ou null.
 */
export async function findAccountByProfileSlug(slug: string) {
  return getPrisma().userProfile.findUnique({
    where: { slug },
    select: {
      userId: true,
    },
  });
}

/**
 * Cree ou met a jour l'identite locale depuis Clerk, cree le role par defaut et le profil si besoin.
 * @param args Donnees Clerk normalisees, valeurs de profil par defaut et role initial.
 * @returns Le compte complet apres transaction.
 */
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
  defaultRoles: RoleCode[];
}) {
  return getPrisma().$transaction(async (tx) => {
    const buildIdentityData = async (targetUserId?: string) => {
      let username = args.username;

      if (username) {
        const existingByUsername = await tx.user.findUnique({
          where: { username },
          select: { id: true },
        });

        if (existingByUsername && existingByUsername.id !== targetUserId) {
          username = null;
        }
      }

      return {
        email: args.email,
        username,
        firstName: args.firstName,
        lastName: args.lastName,
        emailVerifiedAt: args.emailVerifiedAt,
        status: "ACTIVE" as const,
        deletedAt: null,
      };
    };
    const existingByClerkId = await tx.user.findUnique({
      where: {
        clerkUserId: args.clerkUserId,
      },
      select: {
        id: true,
      },
    });
    const existingByEmail = existingByClerkId
      ? null
      : await tx.user.findUnique({
          where: {
            email: args.email,
          },
          select: {
            id: true,
            clerkUserId: true,
          },
        });

    if (
      existingByEmail?.clerkUserId &&
      existingByEmail.clerkUserId !== args.clerkUserId &&
      !args.emailVerifiedAt
    ) {
      throw new Error("email_already_linked_to_another_clerk_user");
    }

    const user = existingByClerkId
      ? await tx.user.update({
          where: {
            id: existingByClerkId.id,
          },
          data: await buildIdentityData(existingByClerkId.id),
          select: {
            id: true,
          },
        })
      : existingByEmail
        ? await tx.user.update({
            where: {
              id: existingByEmail.id,
            },
            data: {
              ...(await buildIdentityData(existingByEmail.id)),
              clerkUserId: args.clerkUserId,
            },
            select: {
              id: true,
            },
          })
        : await tx.user.create({
            data: {
              ...(await buildIdentityData()),
              clerkUserId: args.clerkUserId,
            },
            select: {
              id: true,
            },
          });
    const roleCount = await tx.userRoleAssignment.count({
      where: {
        userId: user.id,
      },
    });

    if (roleCount === 0) {
      await tx.userRoleAssignment.createMany({
        data: args.defaultRoles.map((role) => ({ userId: user.id, role })),
        skipDuplicates: true,
      });
    }

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

/**
 * Applique les changements de profil autorises pour l'utilisateur Clerk donne.
 * @param args.clerkUserId Identifiant Clerk du compte a modifier.
 * @param args.profile Champs de profil deja valides par la couche validation.
 * @returns Le compte complet mis a jour.
 */
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

/**
 * Remplace uniquement les roles self-service d'un compte, sans toucher aux roles administratifs.
 * @param args.clerkUserId Identifiant Clerk du compte cible.
 * @param args.allowedRoles Roles que l'utilisateur peut gerer lui-meme.
 * @param args.replaceWith Nouvelle liste de roles self-service valides.
 * @returns Le compte complet apres remplacement transactionnel.
 */
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

/**
 * Remplace tous les roles d'un compte depuis une source serveur de confiance
 * comme les metadata privees Clerk ou une future route admin.
 * @param args.clerkUserId Identifiant Clerk du compte cible.
 * @param args.roles Roles domaine deja valides.
 */
export async function replaceAccountRolesByClerkUserId(args: {
  clerkUserId: string;
  roles: RoleCode[];
}) {
  return getPrisma().$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { clerkUserId: args.clerkUserId },
      select: { id: true },
    });

    await tx.userRoleAssignment.deleteMany({
      where: {
        userId: user.id,
      },
    });

    await tx.userRoleAssignment.createMany({
      data: args.roles.map((role) => ({
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

/**
 * Marque un compte comme supprime apres reception d'un webhook Clerk.
 * @param clerkUserId Identifiant Clerk a detacher du compte local.
 * @returns Le resultat Prisma updateMany pour permettre un traitement idempotent.
 */
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
