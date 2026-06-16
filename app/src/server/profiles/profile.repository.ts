import "server-only";

import { getPrisma } from "@/lib/prisma";

import type { ProfileListItemRecord, ProfileRecord } from "./profile.types";

/**
 * Charge un profil public/interne par slug avec ses roles utilisateur.
 * @param slug Slug de profil a rechercher.
 * @returns Profil enrichi ou null.
 */
export async function findProfileBySlug(slug: string): Promise<ProfileRecord | null> {
  const prisma = getPrisma();

  const profile = await prisma.userProfile.findUnique({
    where: { slug },
    select: {
      id: true,
      displayName: true,
      slug: true,
      bio: true,
      city: true,
      countryCode: true,
      isPublic: true,
      beatCount: true,
      followerCount: true,
      saleCount: true,
      sellerRatingAvg: true,
      sellerRatingCount: true,
      user: {
        select: {
          id: true,
          clerkUserId: true,
          roles: {
            select: {
              role: true,
            },
            orderBy: {
              role: "asc",
            },
          },
        },
      },
    },
  });

  if (!profile) {
    return null;
  }

  return {
    ...profile,
    sellerRatingAvg: profile.sellerRatingAvg ? Number(profile.sellerRatingAvg) : null,
  };
}

/**
 * Liste les profils pour l'API de decouverte.
 * @returns Profils avec roles, tries du plus recent au plus ancien.
 */
export async function findAllProfiles(): Promise<ProfileListItemRecord[]> {
  const prisma = getPrisma();

  return prisma.userProfile.findMany({
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      displayName: true,
      slug: true,
      bio: true,
      isPublic: true,
      user: {
        select: {
          roles: {
            select: {
              role: true,
            },
            orderBy: {
              role: "asc",
            },
          },
        },
      },
    },
  });
}
