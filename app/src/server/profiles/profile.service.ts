import "server-only";

import type {
  ProfileApiPayload,
  ProfileListItemApiPayload,
} from "./profile.types";
import { findAllProfiles, findProfileBySlug } from "./profile.repository";

const profileSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidProfileSlug(value: string) {
  return value.length >= 3 && value.length <= 64 && profileSlugPattern.test(value);
}

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
  };
}

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
