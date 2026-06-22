import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: {
    id: "user_1",
    clerkUserId: "clerk_1",
    email: "seller@example.com",
    username: "seller",
    stripeCustomerId: null as string | null,
    profile: {
      displayName: "Seller",
    },
  },
  prisma: {
    subscriptionPlan: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    userSubscription: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
  stripe: {
    createCustomer: vi.fn(),
    createSubscriptionCheckout: vi.fn(),
    createPortalSession: vi.fn(),
    listCustomerSubscriptions: vi.fn(),
    retrieveSubscription: vi.fn(),
  },
  email: {
    sendSubscriptionStarted: vi.fn(),
    sendSubscriptionEnded: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => mocks.prisma,
}));

vi.mock("@/server/account/account.sync", () => ({
  syncCurrentAccountFromClerk: () => Promise.resolve(mocks.account),
}));

vi.mock("@/lib/stripe.client", () => ({
  createStripeCustomer: mocks.stripe.createCustomer,
  createStripeSubscriptionCheckoutSession: mocks.stripe.createSubscriptionCheckout,
  createStripeBillingPortalSession: mocks.stripe.createPortalSession,
  listStripeCustomerSubscriptions: mocks.stripe.listCustomerSubscriptions,
  retrieveStripeSubscription: mocks.stripe.retrieveSubscription,
}));

vi.mock("@/server/email/email.service", () => ({
  emailService: mocks.email,
}));

describe("subscription service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("STRIPE_UNIVERSE_MONTHLY_PRICE_ID", "price_monthly");
    vi.stubEnv("UNIVERSE_PRICING_MONTHLY_LABEL", "4,99 €/mois");
    mocks.account.stripeCustomerId = null;
    mocks.prisma.subscriptionPlan.upsert.mockResolvedValue({
      id: "plan_1",
      code: "universe_monthly",
      stripePriceId: "price_monthly",
      reducedCommissionRateBp: 900,
    });
    mocks.prisma.subscriptionPlan.findFirst.mockResolvedValue({
      id: "plan_1",
      code: "universe_monthly",
      stripePriceId: "price_monthly",
      reducedCommissionRateBp: 900,
    });
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "user_1" });
    mocks.prisma.user.update.mockResolvedValue({});
    mocks.prisma.userSubscription.findFirst.mockResolvedValue(null);
    mocks.prisma.userSubscription.findMany.mockResolvedValue([]);
    mocks.prisma.userSubscription.findUnique.mockResolvedValue(null);
    mocks.prisma.userSubscription.upsert.mockResolvedValue({ id: "sub_local_1" });
    mocks.stripe.createCustomer.mockResolvedValue({ id: "cus_1" });
    mocks.stripe.createSubscriptionCheckout.mockResolvedValue({
      id: "cs_1",
      url: "https://stripe.test/subscription",
    });
    mocks.stripe.createPortalSession.mockResolvedValue({
      url: "https://stripe.test/portal",
    });
    mocks.stripe.listCustomerSubscriptions.mockResolvedValue({ data: [] });
  });

  it("creates a subscription Checkout Session with the monthly Price id", async () => {
    const { createUniverseSubscriptionCheckoutForCurrentUser } = await import(
      "@/server/subscriptions/subscription.service"
    );

    await expect(
      createUniverseSubscriptionCheckoutForCurrentUser(
        "clerk_1",
        "https://universe.test/api/subscriptions/checkout/stripe",
      ),
    ).resolves.toMatchObject({
      checkoutUrl: "https://stripe.test/subscription",
    });

    expect(mocks.stripe.createSubscriptionCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cus_1",
        userId: "user_1",
        planCode: "universe_monthly",
        priceId: "price_monthly",
      }),
    );
    expect(mocks.prisma.subscriptionPlan.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          priceAmount: 4.99,
        }),
        update: expect.objectContaining({
          priceAmount: 4.99,
        }),
      }),
    );
  });

  it("creates a Customer Portal session for an existing Stripe customer", async () => {
    mocks.account.stripeCustomerId = "cus_existing";
    const { createUniverseSubscriptionPortalForCurrentUser } = await import(
      "@/server/subscriptions/subscription.service"
    );

    await expect(
      createUniverseSubscriptionPortalForCurrentUser(
        "clerk_1",
        "https://universe.test/api/subscriptions/portal/stripe",
      ),
    ).resolves.toEqual({
      provider: "STRIPE",
      portalUrl: "https://stripe.test/portal",
    });
    expect(mocks.stripe.createPortalSession).toHaveBeenCalledWith({
      customerId: "cus_existing",
      returnUrl: "https://universe.test/pricing",
    });
  });

  it("blocks Checkout when an active local subscription already exists", async () => {
    mocks.prisma.userSubscription.findMany.mockResolvedValue([
      {
        id: "sub_local_active",
        providerSubscriptionId: "sub_active",
        status: "ACTIVE",
        currentPeriodEnd: new Date("2099-01-01T00:00:00.000Z"),
        plan: { reducedCommissionRateBp: 900 },
      },
    ]);
    const { createUniverseSubscriptionCheckoutForCurrentUser } = await import(
      "@/server/subscriptions/subscription.service"
    );

    await expect(
      createUniverseSubscriptionCheckoutForCurrentUser(
        "clerk_1",
        "https://universe.test/api/subscriptions/checkout/stripe",
      ),
    ).rejects.toThrow("subscription_already_active");
    expect(mocks.stripe.createSubscriptionCheckout).not.toHaveBeenCalled();
  });

  it("blocks Checkout and synchronizes when Stripe already has a subscription", async () => {
    mocks.account.stripeCustomerId = "cus_existing";
    mocks.stripe.listCustomerSubscriptions.mockResolvedValue({
      data: [
        {
          id: "sub_stripe_active",
          status: "active",
          customer: "cus_existing",
          current_period_start: 1_700_000_000,
          current_period_end: 1_800_000_000,
          canceled_at: null,
          metadata: {
            userId: "user_1",
            planCode: "universe_monthly",
          },
        },
      ],
    });
    const { createUniverseSubscriptionCheckoutForCurrentUser } = await import(
      "@/server/subscriptions/subscription.service"
    );

    await expect(
      createUniverseSubscriptionCheckoutForCurrentUser(
        "clerk_1",
        "https://universe.test/api/subscriptions/checkout/stripe",
      ),
    ).rejects.toThrow("subscription_already_active");
    expect(mocks.prisma.userSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user_1" } }),
    );
    expect(mocks.stripe.createSubscriptionCheckout).not.toHaveBeenCalled();
  });

  it("prefers an active subscription over a more recently updated canceled row", async () => {
    mocks.prisma.userSubscription.findMany.mockResolvedValue([
      {
        id: "sub_canceled",
        providerSubscriptionId: "sub_old",
        status: "CANCELED",
        currentPeriodEnd: null,
        plan: { reducedCommissionRateBp: 900 },
      },
      {
        id: "sub_active",
        providerSubscriptionId: "sub_live",
        status: "ACTIVE",
        currentPeriodEnd: new Date("2099-01-01T00:00:00.000Z"),
        plan: { reducedCommissionRateBp: 900 },
      },
    ]);
    mocks.prisma.user.findUnique.mockResolvedValue({ stripeCustomerId: "cus_1" });
    const { getSubscriptionSummaryForUserId } = await import(
      "@/server/subscriptions/subscription.service"
    );

    await expect(getSubscriptionSummaryForUserId("user_1")).resolves.toMatchObject({
      isPremium: true,
      status: "ACTIVE",
      canManageSubscription: true,
    });
  });

  it("repairs a non-premium local summary from an active Stripe subscription", async () => {
    const activeSubscription = {
      id: "sub_local_repaired",
      providerSubscriptionId: "sub_stripe_active",
      status: "ACTIVE",
      currentPeriodEnd: new Date("2099-01-01T00:00:00.000Z"),
      plan: { reducedCommissionRateBp: 900 },
    };
    mocks.prisma.userSubscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([activeSubscription]);
    mocks.prisma.user.findUnique
      .mockResolvedValueOnce({ stripeCustomerId: "cus_existing" })
      .mockResolvedValue({ id: "user_1" });
    mocks.stripe.listCustomerSubscriptions.mockResolvedValue({
      data: [
        {
          id: "sub_stripe_active",
          status: "active",
          customer: "cus_existing",
          current_period_start: 1_700_000_000,
          current_period_end: 4_000_000_000,
          canceled_at: null,
          metadata: {
            userId: "user_1",
            planCode: "universe_monthly",
          },
        },
      ],
    });
    const { getSubscriptionSummaryForUserId } = await import(
      "@/server/subscriptions/subscription.service"
    );

    await expect(getSubscriptionSummaryForUserId("user_1")).resolves.toMatchObject({
      isPremium: true,
      status: "ACTIVE",
      commissionRateBp: 900,
    });
    expect(mocks.prisma.userSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user_1" } }),
    );
  });

  it("syncs active Stripe subscriptions to local premium status", async () => {
    const { syncStripeSubscription } = await import(
      "@/server/subscriptions/subscription.service"
    );

    await syncStripeSubscription({
      id: "sub_1",
      status: "active",
      customer: "cus_1",
      current_period_start: 1_700_000_000,
      current_period_end: 1_800_000_000,
      canceled_at: null,
      metadata: {
        userId: "user_1",
        planCode: "universe_monthly",
      },
    } as never);

    expect(mocks.prisma.userSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user_1" },
        update: expect.objectContaining({
          status: "ACTIVE",
          planId: "plan_1",
        }),
        create: expect.objectContaining({
          status: "ACTIVE",
          providerSubscriptionId: "sub_1",
        }),
      }),
    );
    expect(mocks.email.sendSubscriptionStarted).toHaveBeenCalledWith("sub_1");
    expect(mocks.email.sendSubscriptionEnded).not.toHaveBeenCalled();
  });
});
