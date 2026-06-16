import "server-only";

import type { RoleCode } from "../../../generated/prisma/enums";
import type { BeatApiPayload } from "../beats/beat.types";

export type ProfileApiPayload = {
  id: string;
  slug: string;
  displayName: string;
  bio: string | null;
  location: {
    city: string | null;
    countryCode: string | null;
  };
  stats: {
    beatCount: number;
    followerCount: number;
    saleCount: number;
    sellerRatingAvg: number | null;
    sellerRatingCount: number;
  };
  roles: RoleCode[];
  subscription: {
    isPremium: boolean;
  };
  visibility: {
    isPublic: boolean;
    viewerCanEdit: boolean;
  };
  beats: BeatApiPayload[];
};

export type ProfileListItemApiPayload = {
  id: string;
  slug: string;
  displayName: string;
  bio: string | null;
  isPublic: boolean;
  roles: RoleCode[];
};

export type ProfileRecord = {
  id: string;
  displayName: string;
  slug: string;
  bio: string | null;
  city: string | null;
  countryCode: string | null;
  isPublic: boolean;
  beatCount: number;
  followerCount: number;
  saleCount: number;
  sellerRatingAvg: number | null;
  sellerRatingCount: number;
  user: {
    id: string;
    clerkUserId: string | null;
    roles: Array<{
      role: RoleCode;
    }>;
  };
};

export type ProfileListItemRecord = {
  id: string;
  displayName: string;
  slug: string;
  bio: string | null;
  isPublic: boolean;
  user: {
    roles: Array<{
      role: RoleCode;
    }>;
  };
};
