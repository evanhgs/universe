import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const summaryMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/server/subscriptions/subscription.service", () => ({
  getSubscriptionSummaryForClerkUser: summaryMock,
}));

vi.mock("@/app/(site)/pricing/pricing-actions", () => ({
  PricingActions: () => <button type="button">Passer à Universe</button>,
}));

describe("PricingPage", () => {
  beforeEach(() => {
    authMock.mockReset().mockResolvedValue({ userId: null });
    summaryMock.mockReset().mockResolvedValue({
      isAuthenticated: false,
      isPremium: false,
      commissionRateBp: 3000,
      status: "INACTIVE",
      currentPeriodEnd: null,
      canManageSubscription: false,
    });
  });

  it("explains the free and Universe subscription benefits", async () => {
    const { default: PricingPage } = await import("@/app/(site)/pricing/page");

    render(await PricingPage());

    expect(screen.getAllByText("Gratuit").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Universe").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/30%/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/9%/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Traitement audio et support plus prioritaires/)).toBeInTheDocument();
  });

  it("shows a success notification after subscription Checkout redirect", async () => {
    const { default: PricingPage } = await import("@/app/(site)/pricing/page");

    render(await PricingPage({ searchParams: Promise.resolve({ subscription: "success" }) }));

    expect(screen.getByText(/abonnement Universe a bien ete pris en compte/)).toBeInTheDocument();
  });
});
