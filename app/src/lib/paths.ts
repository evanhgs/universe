type StaticPagePath = {
  path: string;
  getHref: () => string;
};

function page(path: string): StaticPagePath {
  return {
    path,
    getHref: () => path,
  };
}

function withQuery(path: string, params: Record<string, string | null | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();

  return query ? `${path}?${query}` : path;
}

export const PAGE_PATHS = {
  home: page("/"),
  account: {
    dashboard: page("/account"),
    messages: {
      path: "/account/messages",
      getHref: (conversationId?: string | null) =>
        withQuery("/account/messages", { conversationId }),
    },
    profile: page("/account/profile"),
    purchases: {
      path: "/account/purchases",
      getHref: () => "/account/purchases",
      checkoutCancelled: (orderId: string) =>
        `/account/purchases?orderId=${encodeURIComponent(orderId)}&checkout=cancelled`,
      stripeSuccess: (orderId: string) =>
        `/account/purchases?orderId=${encodeURIComponent(orderId)}&stripeSessionId={CHECKOUT_SESSION_ID}`,
    },
    sales: page("/account/sales"),
    test: page("/account-test"),
  },
  beats: {
    catalog: {
      path: "/beats",
      getHref: (params?: { search?: string | null; genre?: string | null; sellerSlug?: string | null }) =>
        withQuery("/beats", {
          search: params?.search,
          genre: params?.genre,
          sellerSlug: params?.sellerSlug,
        }),
    },
    detail: {
      path: "/beats/[slug]",
      getHref: (slug: string) => `/beats/${slug}`,
      checkoutCancelled: (slug: string) => `/beats/${slug}?checkout=cancelled`,
    },
    upload: page("/beats/upload"),
  },
  feed: page("/feed"),
  legal: {
    privacyPolicy: page("/privacy-policy"),
    termsOfService: page("/terms-of-service"),
  },
  pricing: {
    path: "/pricing",
    getHref: () => "/pricing",
    checkoutCancelled: () => "/pricing?subscription=cancelled",
    checkoutSuccess: () => "/pricing?subscription=success&stripeSessionId={CHECKOUT_SESSION_ID}",
  },
  profiles: {
    detail: {
      path: "/profiles/[slug]",
      getHref: (slug: string) => `/profiles/${slug}`,
    },
  },
} as const;

export const API_PATHS = {
  root: {
    path: "/api/",
    getHref: () => "/api/",
  },
  account: {
    me: () => "/api/account/me",
    profile: () => "/api/account/me/profile",
    roles: () => "/api/account/me/roles",
    test: {
      analytics: () => "/api/account-test/analytics",
      email: () => "/api/account-test/email",
      rateLimit: () => "/api/account-test/rate-limit",
      sentry: () => "/api/account-test/sentry",
    },
  },
  analytics: {
    events: () => "/api/analytics/events",
  },
  beats: {
    list: (params?: URLSearchParams | string) => {
      const query = typeof params === "string" ? params : params?.toString();

      return query ? `/api/beats?${query}` : "/api/beats";
    },
    preview: (slug: string) => `/api/beats/${slug}/preview`,
    previewRetry: (slug: string) => `/api/beats/${encodeURIComponent(slug)}/preview/retry`,
  },
  chat: {
    conversations: () => "/api/chat/conversations",
    conversationMessages: (conversationId: string) =>
      `/api/chat/conversations/${conversationId}/messages`,
    conversationRead: (conversationId: string) =>
      `/api/chat/conversations/${conversationId}/read`,
    unreadCount: () => "/api/chat/unread-count",
  },
  feed: {
    list: (params?: URLSearchParams | string) => {
      const query = typeof params === "string" ? params : params?.toString();

      return query ? `/api/feed?${query}` : "/api/feed";
    },
  },
  marketplace: {
    downloads: (entitlementId: string) => `/api/marketplace/downloads/${entitlementId}`,
    orders: {
      create: () => "/api/marketplace/orders",
      checkoutStripe: (orderId: string) =>
        `/api/marketplace/orders/${orderId}/checkout/stripe`,
      confirmStripePayment: (orderId: string) =>
        `/api/marketplace/orders/${orderId}/payments/stripe/confirm`,
    },
    purchases: () => "/api/marketplace/purchases",
    sales: () => "/api/marketplace/sales",
    exclusiveOffers: {
      list: () => "/api/marketplace/exclusive-offers",
      detail: (offerId: string) =>
        `/api/marketplace/exclusive-offers/${encodeURIComponent(offerId)}`,
    },
    promotions: {
      list: () => "/api/marketplace/promotions",
      detail: (promotionId: string) =>
        `/api/marketplace/promotions/${encodeURIComponent(promotionId)}`,
    },
  },
  storage: {
    uploads: {
      presign: () => "/api/storage/uploads/presign",
    },
  },
  subscriptions: {
    checkoutStripe: () => "/api/subscriptions/checkout/stripe",
    portalStripe: () => "/api/subscriptions/portal/stripe",
  },
} as const;
