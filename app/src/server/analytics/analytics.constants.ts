import "server-only";

export const EVENT_WEIGHTS = {
  beat_impression: 0.1,
  beat_click: 1.0,
  beat_play: 1.5,
  beat_pause: 0.2,
  beat_full_play: 3.0,
  beat_like: 4.0,
  beat_save: 5.0,
  beat_share: 6.0,
  seller_profile_view: 2.0,
  seller_follow: 7.0,
  license_click: 8.0,
  add_to_cart: 12.0,
  purchase: 20.0,
  search: 1.0,
  message_seller: 10.0,
  beat_skip: -3.0,
} as const;

export const ORGANIC_SCORE = {
  engagement_score: 0.3,
  keyword_score: 0.2,
  similarity_score: 0.15,
  sales_score: 0.15,
  freshness_score: 0.1,
  seller_score: 0.05,
  diversity_score: 0.05,
} as const;

export const ANALYTICS_EVENT_TYPES = [
  "beat_impression",
  "beat_click",
  "beat_play",
  "beat_pause",
  "beat_skip",
  "beat_full_play",
  "beat_like",
  "beat_save",
  "beat_share",
  "seller_profile_view",
  "seller_follow",
  "license_click",
  "add_to_cart",
  "purchase",
  "search",
  "message_seller",
] as const;

export const ANONYMOUS_ANALYTICS_EVENTS = new Set([
  "beat_impression",
  "beat_play",
  "beat_pause",
  "beat_skip",
  "beat_full_play",
]);

export const CLIENT_BLOCKED_ANALYTICS_EVENTS = new Set(["purchase"]);

export const ANALYTICS_SOURCES = [
  "feed",
  "search",
  "profile",
  "similar",
  "trending",
] as const;

export const RECOMMENDATION_SCORE_VERSION = "v2-next-prisma-mvp";

export const FEED_MIX = {
  organic: 0.7,
  exploration: 0.15,
  newSellers: 0.1,
  trending: 0.05,
} as const;

export const FEED_DIVERSITY_LIMITS = {
  seller: 3,
  genre: 6,
  mood: 5,
} as const;

export const RECENT_IMPRESSION_WINDOW_HOURS = 24;
export const RECENT_SKIP_WINDOW_DAYS = 7;
export const DEFAULT_FEED_SCORE_SEED = 0.42;
