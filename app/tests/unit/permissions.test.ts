import { describe, expect, it } from "vitest";

import {
  assertCan,
  authorize,
  can,
  getPayoutEligibility,
  type Actor,
} from "@/server/security/permissions";

const activeSeller: Actor = {
  id: "user_seller",
  clerkUserId: "clerk_seller",
  status: "ACTIVE",
  roles: ["BUYER", "SELLER"],
};
const activeBuyer: Actor = {
  id: "user_buyer",
  clerkUserId: "clerk_buyer",
  status: "ACTIVE",
  roles: ["BUYER"],
};

describe("permissions", () => {
  it("allows any active authenticated account to publish without KYC", () => {
    expect(can(activeSeller, "beat:create")).toBe(true);
    expect(can(activeBuyer, "beat:create")).toBe(true);
    expect(can(activeSeller, "sellerDashboard:read:own")).toBe(true);
    expect(can(activeBuyer, "sellerDashboard:read:own")).toBe(false);
  });

  it("uses resource attributes for own beat mutations", () => {
    expect(
      can(activeSeller, "beat:update:own", {
        kind: "beat",
        ownerId: "user_seller",
      }),
    ).toBe(true);
    expect(
      can(activeSeller, "beat:update:own", {
        kind: "beat",
        ownerId: "user_other",
      }),
    ).toBe(false);
  });

  it("returns the matched ABAC policy ids for a decision", () => {
    expect(
      authorize({
        subject: activeSeller,
        action: "beat:create",
        resource: { kind: "beat" },
        environment: { now: new Date("2026-01-01T00:00:00.000Z") },
      }),
    ).toMatchObject({
      allowed: true,
      effect: "allow",
      matchedPolicyIds: ["allow-active-beat-create"],
    });
  });

  it("applies explicit deny before allow for inactive accounts", () => {
    const decision = authorize({
      subject: {
        ...activeSeller,
        status: "SUSPENDED",
      },
      action: "beat:create",
      resource: { kind: "beat" },
      environment: { now: new Date("2026-01-01T00:00:00.000Z") },
    });

    expect(decision).toMatchObject({
      allowed: false,
      effect: "deny",
      reason: "account_not_active",
    });
    expect(decision.matchedPolicyIds).toContain("deny-deleted-or-suspended-subject");
  });

  it("blocks payouts until KYC and payout account are ready", () => {
    expect(
      getPayoutEligibility(activeSeller, {
        kycStatus: "NOT_STARTED",
        payoutAccountReady: false,
      }),
    ).toMatchObject({
      canReceivePayouts: false,
      reason: "PENDING_KYC",
    });

    expect(
      getPayoutEligibility(activeSeller, {
        kycStatus: "VERIFIED",
        payoutAccountReady: true,
      }),
    ).toMatchObject({
      canReceivePayouts: true,
      reason: null,
    });
  });

  it("keeps privileged permissions out of self-service roles", () => {
    expect(can(activeSeller, "admin:users:manage")).toBe(false);
    expect(() => assertCan(activeSeller, "admin:users:manage")).toThrow(
      "admin_role_required",
    );
  });
});
