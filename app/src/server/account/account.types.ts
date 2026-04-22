import "server-only";

import type { RoleCode } from "../../../generated/prisma/enums";

export type NormalizedClerkAccount = {
  clerkUserId: string;
  email: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  emailVerifiedAt: Date | null;
};

export type AccountSnapshot = {
  user: {
    id: string;
    clerkUserId: string;
    email: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    status: string;
    emailVerifiedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  profile: {
    id: string;
    displayName: string;
    slug: string;
    bio: string | null;
    city: string | null;
    countryCode: string | null;
    isPublic: boolean;
  };
  roles: RoleCode[];
};

export type UpdateAccountProfileInput = {
  firstName?: string;
  lastName?: string;
  username?: string;
  displayName?: string;
  slug?: string;
  bio?: string | null;
  city?: string | null;
  countryCode?: string | null;
  isPublic?: boolean;
};
