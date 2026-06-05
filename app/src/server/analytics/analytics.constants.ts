import "server-only";

export const EVENT_WEIGHTS = {
    beat_impression: 0.1,
    beat_click: 1.0,
    beat_play: 1.5,
    beat_full_play: 3.0,
    beat_like: 4.0,
    beat_save: 5.0,
    beat_share: 6.0,
    seller_profile_view: 2.0,
    seller_follow: 7.0,
    license_click: 8.0,
    add_to_cart: 12.0,
    purchase: 20.0,
    message_seller: 10.0,
    beat_skip: -3.0
};

/**
 * score organique globale
 * organic_score =
 *   30 % engagement_score
 * + 20 % keyword_score
 * + 15 % similarity_score
 * + 15 % sales_score
 * + 10 % freshness_score
 * + 5 % seller_score
 * + 5 % diversity_score
 */
export const ORGANIC_SCORE = {
    engagement_score: 30,
    keyword_score: 20,
    similarity_score: 15,
    sales_score: 15,
    freshness_score: 10,
    seller_score: 5,
    diversity_score: 5,
}