import "server-only";

import type {
  ProfileApiPayload,
  ProfileListItemApiPayload,
} from "./profile.types";
import { findAllProfiles, findProfileBySlug } from "./profile.repository";
import { listProfileBeatPayloads } from "../beats/beat.service";

const profileSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Valide le format public d'un slug de profil.
 * @param value Slug a tester.
 * @returns true si longueur et caracteres sont acceptes.
 */
export function isValidProfileSlug(value: string) {
  return value.length >= 3 && value.length <= 64 && profileSlugPattern.test(value);
}

/**
 * Retourne un profil detaille si le visiteur a le droit de le voir.
 * @param slug Slug public du profil.
 * @param viewerClerkUserId Identifiant Clerk du visiteur ou null.
 * @returns Payload profil avec beats publics, ou null si absent/non autorise.
 */
export async function getProfilePayloadBySlug(
  slug: string,
  viewerClerkUserId: string | null,
): Promise<ProfileApiPayload | null> {
  const profile = await findProfileBySlug(slug);

  if (!profile) {
    return null;
  }

  const viewerCanEdit =
    viewerClerkUserId !== null && profile.user.clerkUserId === viewerClerkUserId;

  if (!profile.isPublic && !viewerCanEdit) {
    return null;
  }

  const beats = await listProfileBeatPayloads(profile.slug);

  return {
    id: profile.id,
    slug: profile.slug,
    displayName: profile.displayName,
    bio: profile.bio,
    location: {
      city: profile.city,
      countryCode: profile.countryCode,
    },
    stats: {
      beatCount: profile.beatCount,
      followerCount: profile.followerCount,
      saleCount: profile.saleCount,
      sellerRatingAvg: profile.sellerRatingAvg,
      sellerRatingCount: profile.sellerRatingCount,
    },
    roles: profile.user.roles.map(({ role }) => role),
    visibility: {
      isPublic: profile.isPublic,
      viewerCanEdit,
    },
    beats,
  };
}

/**
 * Liste les profils sous forme de payload API.
 * @returns Profils serialises pour l'API /profiles.
 */
export async function listProfilesPayload(): Promise<ProfileListItemApiPayload[]> {
  const profiles = await findAllProfiles();

  return profiles.map((profile) => ({
    id: profile.id,
    slug: profile.slug,
    displayName: profile.displayName,
    bio: profile.bio,
    isPublic: profile.isPublic,
    roles: profile.user.roles.map(({ role }) => role),
  }));
}
