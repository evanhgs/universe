import "server-only";

import { auth } from "@clerk/nextjs/server";

import { syncCurrentAccountFromClerk } from "@/server/account/account.sync";

import type { KycStatus, RoleCode, UserStatus } from "../../../generated/prisma/enums";

export type Permission =
  | "beat:create"
  | "beat:update:own"
  | "beat:delete:own"
  | "sellerDashboard:read:own"
  | "order:buy"
  | "payout:setup"
  | "payout:receive"
  | "admin:users:manage"
  | "kyc:review";

export type Action = Permission;

export type Actor = {
  id: string;
  clerkUserId: string;
  status: UserStatus | string;
  roles: RoleCode[];
  kycStatus?: KycStatus | null;
  payoutAccountReady?: boolean;
};

export type ResourceKind =
  | "beat"
  | "sellerDashboard"
  | "order"
  | "payout"
  | "adminUsers"
  | "kycVerification";

export type ResourceContext = {
  kind?: ResourceKind;
  ownerId?: string | null;
  sellerId?: string | null;
  buyerId?: string | null;
  userId?: string | null;
  targetUserId?: string | null;
  status?: string | null;
  visibility?: string | null;
  kycStatus?: KycStatus | null;
  payoutAccountReady?: boolean;
};

export type EnvironmentContext = {
  now: Date;
  isSystem?: boolean;
};

export type AuthorizationRequest = {
  subject: Actor;
  action: Action;
  resource: ResourceContext;
  environment: EnvironmentContext;
};

export type AuthorizationDecision = {
  allowed: boolean;
  effect: "allow" | "deny";
  matchedPolicyIds: string[];
  reason: string;
};

type Policy = {
  id: string;
  effect: "allow" | "deny";
  actions: Action[];
  condition: (request: AuthorizationRequest) => boolean;
  reason?: string;
};

const DEFAULT_PERMISSION_ERROR: Record<Permission, string> = {
  "beat:create": "seller_role_required",
  "beat:update:own": "beat_forbidden",
  "beat:delete:own": "beat_forbidden",
  "sellerDashboard:read:own": "seller_role_required",
  "order:buy": "buyer_role_required",
  "payout:setup": "payout_forbidden",
  "payout:receive": "payout_not_eligible",
  "admin:users:manage": "admin_role_required",
  "kyc:review": "moderator_role_required",
};

const WRITE_ACTIONS = [
  "beat:create",
  "beat:update:own",
  "beat:delete:own",
  "payout:setup",
  "payout:receive",
  "admin:users:manage",
  "kyc:review",
] satisfies Action[];

const ALL_ACTIONS = [
  ...WRITE_ACTIONS,
  "sellerDashboard:read:own",
  "order:buy",
] satisfies Action[];

const POLICIES = [
  {
    id: "deny-deleted-or-suspended-subject",
    effect: "deny",
    actions: ALL_ACTIONS,
    condition: ({ subject }) => subject.status === "DELETED" || subject.status === "SUSPENDED",
    reason: "account_not_active",
  },
  {
    id: "deny-non-active-seller-mutations",
    effect: "deny",
    actions: [
      "beat:create",
      "beat:update:own",
      "beat:delete:own",
      "sellerDashboard:read:own",
      "payout:setup",
      "payout:receive",
    ],
    condition: ({ subject }) => subject.status !== "ACTIVE",
    reason: "account_not_active",
  },
  {
    id: "allow-admin-user-management",
    effect: "allow",
    actions: ["admin:users:manage"],
    condition: ({ subject }) => isActive(subject) && hasRole(subject, "ADMIN"),
  },
  {
    id: "allow-admin-kyc-review",
    effect: "allow",
    actions: ["kyc:review"],
    condition: ({ subject }) => isActive(subject) && hasRole(subject, "ADMIN"),
  },
  {
    id: "allow-moderator-kyc-review",
    effect: "allow",
    actions: ["kyc:review"],
    condition: ({ subject }) => isActive(subject) && hasRole(subject, "MODERATOR"),
  },
  {
    id: "allow-admin-beat-moderation",
    effect: "allow",
    actions: ["beat:update:own", "beat:delete:own"],
    condition: ({ subject }) => isActive(subject) && hasRole(subject, "ADMIN"),
  },
  {
    id: "allow-buyer-order-purchase",
    effect: "allow",
    actions: ["order:buy"],
    condition: ({ subject }) =>
      isActive(subject) &&
      (hasRole(subject, "BUYER") || hasRole(subject, "SELLER") || hasRole(subject, "ENGINEER")),
  },
  {
    id: "allow-seller-beat-create",
    effect: "allow",
    actions: ["beat:create"],
    condition: ({ subject }) => isActive(subject) && hasRole(subject, "SELLER"),
  },
  {
    id: "allow-seller-own-beat-write",
    effect: "allow",
    actions: ["beat:update:own", "beat:delete:own"],
    condition: ({ subject, resource }) =>
      isActive(subject) && hasRole(subject, "SELLER") && resource.kind === "beat" && owns(subject, resource),
  },
  {
    id: "allow-seller-own-dashboard",
    effect: "allow",
    actions: ["sellerDashboard:read:own"],
    condition: ({ subject, resource }) =>
      isActive(subject) &&
      hasRole(subject, "SELLER") &&
      (resource.kind == null || resource.kind === "sellerDashboard") &&
      (hasNoOwnershipAttribute(resource) || owns(subject, resource)),
  },
  {
    id: "allow-seller-payout-setup",
    effect: "allow",
    actions: ["payout:setup"],
    condition: ({ subject, resource }) =>
      isActive(subject) &&
      hasRole(subject, "SELLER") &&
      (resource.kind == null || resource.kind === "payout") &&
      (hasNoOwnershipAttribute(resource) || owns(subject, resource)),
  },
  {
    id: "allow-verified-seller-payout-receive",
    effect: "allow",
    actions: ["payout:receive"],
    condition: ({ subject, resource }) => {
      const kycStatus = resource.kycStatus ?? subject.kycStatus;
      const payoutAccountReady = resource.payoutAccountReady ?? subject.payoutAccountReady ?? false;

      return (
        isActive(subject) &&
        hasRole(subject, "SELLER") &&
        (resource.kind == null || resource.kind === "payout") &&
        (hasNoOwnershipAttribute(resource) || owns(subject, resource)) &&
        kycStatus === "VERIFIED" &&
        payoutAccountReady
      );
    },
  },
] satisfies Policy[];
const POLICY_SET: Policy[] = POLICIES;

/**
 * Convertit un compte Prisma charge par la synchro Clerk en sujet ABAC.
 * Les roles restent des attributs du sujet, pas le modele d'autorisation.
 * @param account Compte local avec roles charges.
 */
export function actorFromAccount(account: {
  id: string;
  clerkUserId: string | null;
  status: UserStatus | string;
  roles: Array<{ role: RoleCode }>;
}): Actor {
  return {
    id: account.id,
    clerkUserId: account.clerkUserId ?? "",
    status: account.status,
    roles: account.roles.map(({ role }) => role),
  };
}

/**
 * Charge l'utilisateur courant Clerk, synchronise son compte local et retourne
 * le sujet ABAC utilise par les policies serveur.
 */
export async function getCurrentActor() {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated || !userId) {
    throw new Error("unauthorized");
  }

  const account = await syncCurrentAccountFromClerk();

  if (account.clerkUserId !== userId) {
    throw new Error("account_not_found");
  }

  return actorFromAccount(account);
}

/**
 * Evalue une decision ABAC complete: deny explicite prioritaire, puis allow,
 * puis deny implicite si aucune policy ne matche.
 * @param request Requete subject/action/resource/environment.
 */
export function authorize(request: AuthorizationRequest): AuthorizationDecision {
  const matchingPolicies = POLICY_SET.filter(
    (policy) => policy.actions.includes(request.action) && policy.condition(request),
  );
  const denyPolicies = matchingPolicies.filter((policy) => policy.effect === "deny");

  if (denyPolicies.length > 0) {
    return {
      allowed: false,
      effect: "deny",
      matchedPolicyIds: denyPolicies.map((policy) => policy.id),
      reason: denyPolicies[0]?.reason ?? "explicit_deny",
    };
  }

  const allowPolicies = matchingPolicies.filter((policy) => policy.effect === "allow");

  if (allowPolicies.length > 0) {
    return {
      allowed: true,
      effect: "allow",
      matchedPolicyIds: allowPolicies.map((policy) => policy.id),
      reason: "allowed",
    };
  }

  return {
    allowed: false,
    effect: "deny",
    matchedPolicyIds: [],
    reason: "implicit_deny",
  };
}

/**
 * Teste une permission domaine avec une facade simple conservee pour les services.
 * @param actor Sujet ABAC.
 * @param permission Action demandee.
 * @param resource Attributs de ressource.
 * @param environment Attributs d'environnement.
 */
export function can(
  actor: Actor,
  permission: Permission,
  resource: ResourceContext = {},
  environment: Partial<EnvironmentContext> = {},
) {
  return authorize({
    subject: actor,
    action: permission,
    resource: inferResourceKind(permission, resource),
    environment: {
      now: environment.now ?? new Date(),
      isSystem: environment.isSystem,
    },
  }).allowed;
}

/**
 * Exige une permission et leve un code d'erreur stable pour les routes HTTP.
 * @param actor Sujet ABAC.
 * @param permission Action demandee.
 * @param resource Attributs de ressource.
 * @param errorCode Code applicatif optionnel.
 */
export function assertCan(
  actor: Actor,
  permission: Permission,
  resource?: ResourceContext,
  errorCode = DEFAULT_PERMISSION_ERROR[permission],
) {
  if (!can(actor, permission, resource)) {
    throw new Error(errorCode);
  }
}

/**
 * Determine l'etat de retrait vendeur avec KYC et compte payout.
 * @param actor Vendeur courant.
 * @param resource Etat KYC/payout charge depuis le domaine marketplace.
 */
export function getPayoutEligibility(actor: Actor, resource: ResourceContext = {}) {
  const payoutResource = inferResourceKind("payout:receive", {
    ...resource,
    kycStatus: resource.kycStatus ?? actor.kycStatus ?? null,
    payoutAccountReady: resource.payoutAccountReady ?? actor.payoutAccountReady ?? false,
  });
  const decision = authorize({
    subject: actor,
    action: "payout:receive",
    resource: payoutResource,
    environment: {
      now: new Date(),
    },
  });
  const reason = decision.allowed
    ? null
    : !isActive(actor)
      ? "ACCOUNT_NOT_ACTIVE"
      : payoutResource.kycStatus !== "VERIFIED"
        ? "PENDING_KYC"
        : !payoutResource.payoutAccountReady
          ? "PAYOUT_ACCOUNT_REQUIRED"
          : "PAYOUT_FORBIDDEN";

  return {
    canReceivePayouts: decision.allowed,
    kycStatus: payoutResource.kycStatus ?? null,
    payoutAccountReady: payoutResource.payoutAccountReady ?? false,
    reason,
  };
}

function inferResourceKind(permission: Permission, resource: ResourceContext): ResourceContext {
  if (resource.kind) {
    return resource;
  }

  if (permission.startsWith("beat:")) {
    return { ...resource, kind: "beat" };
  }

  if (permission.startsWith("sellerDashboard:")) {
    return { ...resource, kind: "sellerDashboard" };
  }

  if (permission.startsWith("order:")) {
    return { ...resource, kind: "order" };
  }

  if (permission.startsWith("payout:")) {
    return { ...resource, kind: "payout" };
  }

  if (permission.startsWith("admin:")) {
    return { ...resource, kind: "adminUsers" };
  }

  return { ...resource, kind: "kycVerification" };
}

function isActive(actor: Actor) {
  return actor.status === "ACTIVE";
}

function hasRole(actor: Actor, role: RoleCode) {
  return actor.roles.includes(role);
}

function owns(actor: Actor, resource: ResourceContext) {
  return (
    resource.ownerId === actor.id ||
    resource.sellerId === actor.id ||
    resource.userId === actor.id ||
    resource.targetUserId === actor.id
  );
}

function hasNoOwnershipAttribute(resource: ResourceContext) {
  return (
    resource.ownerId == null &&
    resource.sellerId == null &&
    resource.userId == null &&
    resource.targetUserId == null
  );
}
