import "server-only";

import type { RoleCode } from "../../../generated/prisma/enums";

export const ROLE_CODES = [
  "BUYER",
  "SELLER",
  "ENGINEER",
  "ADMIN",
  "MODERATOR",
] as const satisfies RoleCode[];
export const DEFAULT_ACCOUNT_ROLES = ["BUYER", "SELLER"] as const satisfies RoleCode[];
export const SELF_SERVICE_ROLE_CODES = ["BUYER", "SELLER"] as const satisfies RoleCode[];

export type SelfServiceRoleCode = (typeof SELF_SERVICE_ROLE_CODES)[number];

export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])?$/;
export const PROFILE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
