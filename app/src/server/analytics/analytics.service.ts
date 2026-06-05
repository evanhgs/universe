import "server-only";
import {EVENT_WEIGHTS, ORGANIC_SCORE} from "@/server/analytics/analytics.constants";
import {AnalyticsTypes} from "@/server/analytics/analytics.types";

/**
 * formule d'engagement d'un beat en prenant les metadatas pondérés aux constantes
 * @param stats
 */
function computeEngagementScore(stats) {
    return (
        stats.clicks * EVENT_WEIGHTS.beat_click +
        stats.plays * EVENT_WEIGHTS.beat_play +
        stats.fullPlays * EVENT_WEIGHTS.beat_full_play +
        stats.likes * EVENT_WEIGHTS.beat_like +
        stats.saves * EVENT_WEIGHTS.beat_save +
        stats.shares * EVENT_WEIGHTS.beat_share +
        stats.licenseClicks * EVENT_WEIGHTS.license_click +
        stats.addToCart * EVENT_WEIGHTS.add_to_cart +
        stats.purchases * EVENT_WEIGHTS.purchase -
        stats.fastSkips * EVENT_WEIGHTS.beat_skip
    );
}

/**
 * Un beat récent doit pouvoir apparaître même s’il n’a pas encore beaucoup d’interactions
 * @param createdAt
 */
function computeFreshnessScore(createdAt: Date){
    const ageInDays = daysBetween(createdAt, new Date());
    if (ageInDays <= 1) return 1.0;
    if (ageInDays <= 3) return 0.9;
    if (ageInDays <= 7) return 0.8;
    if (ageInDays <= 14) return 0.6;
    if (ageInDays <= 21) return 0.4;
    if (ageInDays <= 30) return 0.2;
    if (ageInDays <= 50) return 0.1;
    return 0.05;
}

/**
 * Le score de vente indique si le beat convertit réellement.
 * @param stats
 */
function computeSalesScore(stats) {
    return (
        stats.purchases * 20 +
        stats.addToCart * 10 +
        stats.licenseClicks * 5 +
        stats.revenue * 0.02
    );
}


/**
 * rend la conversion plus naturelle a partir de 100 impression un beat obtient le taux de conversion
 * @param purchases
 * @param impressions
 */
function computeConversionRate(purchases, impressions) {
    if (impressions < 100) return 0;
    return purchases / impressions;
}

/**
 * score mot clés, objectif renforcer la proposition en fonction des tags user/beat
 * @param userProfile
 * @param beat
 * Example :
 * {
 *   userId: "user_123",
 *   favoriteGenres: {
 *     trap: 0.8,
 *     drill: 0.6,
 *     afro: 0.3
 *   },
 *   favoriteMoods: {
 *     dark: 0.9,
 *     melodic: 0.7,
 *     sad: 0.5
 *   },
 *   favoriteTags: {
 *     piano: 0.8,
 *     808: 0.7,
 *     guitar: 0.4
 *   },
 *   preferredBpmRange: [130, 150]
 * }
 */
function computeKeywordScore(userProfile, beat) {
    let score = 0;

    for (const tag of beat.tags) {
        score += userProfile.favoriteTags[tag] ?? 0;
    }

    score += userProfile.favoriteGenres[beat.genre] ?? 0;

    for (const mood of beat.mood) {
        score += userProfile.favoriteMoods[mood] ?? 0;
    }

    return normalizeScoreZ(score);
}

/**
 * Calcul score de similarité
 * @param userLikedBeats
 * @param candidateBeat
 */
function computeSimilarityScore(userLikedBeats, candidateBeat) {
    let score = 0;

    for (const likedBeat of userLikedBeats) {
        if (likedBeat.genre === candidateBeat.genre) score += 0.3; // remplacer par des constantes
        if (Math.abs(likedBeat.bpm - candidateBeat.bpm) <= 10) score += 0.2;
        if (likedBeat.key === candidateBeat.key) score += 0.1;

        const commonTags = likedBeat.tags.filter(tag =>
            candidateBeat.tags.includes(tag)
        );

        score += commonTags.length * 0.1;
    }

    return normalizeScoreLinear(score);
}

/**
 * Calcul score vendeur
 * Critères vendeur:
 * function computeSellerScore(seller) {
 *   return normalize(
 *     seller.salesCount * 2 +
 *     seller.averageRating * 10 +
 *     seller.responseRate * 5 +
 *     seller.successfulOrders * 3 -
 *     seller.disputeRate * 10
 *   );
 * }
 * @param seller
 */
function computeSellerScore(seller) {
    return normalizeScoreZ(
        seller.salesCount * 2 +
        seller.averageRating * 10 +
        seller.responseRate * 5 +
        seller.successfulOrders * 3 -
        seller.disputeRate * 10
    );
}

/**
 * Calcul du score organic
 * @param scores
 */
function computeOrganicScore(scores) {
    return (
        scores.engagement * ORGANIC_SCORE.engagement_score +
        scores.keyword * ORGANIC_SCORE.keyword_score +
        scores.similarity * ORGANIC_SCORE.similarity_score +
        scores.sales * ORGANIC_SCORE.sales_score +
        scores.freshness * ORGANIC_SCORE.freshness_score +
        scores.seller * ORGANIC_SCORE.seller_score +
        scores.diversity * ORGANIC_SCORE.diversity_score
    );
}

/**
 * https://developers.google.com/machine-learning/crash-course/numerical-data/normalization?hl=fr
 * mise à l'échelle linéaire
 * @param data
 */
function normalizeScoreLinear(data) {
    const x = data
    const xMin = Math.min(data)
    const xMax = Math.max(data)
    const normalized = (x - xMin) / (xMax - xMin)
    return normalized
}

/**
 * mise à l'échelle score Z
 * @param data
 */
function normalizeScoreZ(data = []) {
    const x = data
    const avg = data.reduce((acc, val) => acc + val, 0) / data.length;
    const variance = data.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / data.length
    const ecartType = Math.sqrt(variance);

    const zScore = (x - avg) / ecartType
    return zScore;
}

/**
 * fonction pour créer de la diversité
 * rules
 * maximum 3 beats du même vendeur
 * maximum 6 beats du même genre
 * maximum 5 beats avec le même mood principal
 * minimum 2 ou 3 beats de découverte
 * minimum 2 nouveaux vendeurs
 * @param beats
 */
function diversityRules(beats) {
    const result = [];
    const sellerCount = {}
    const genreCount = {}

    for (const beat as beats) {
        if ((sellerCount[beat.sellerId] ?? 0 ) >= 3 ) continue
        if ((genreCount[beat.genre] ?? 0 ) >= 6 ) continue

        result.push(beat)
        sellerCount[beat.sellerId] = (sellerCount[beat.sellerId] ?? 0) + 1;
        genreCount[beat.genre] = (genreCount[beat.genre] ?? 0) + 1;

        if (result.length===20) break
    }
    return result
}

/**
 * Fonction de randomisation pondérées
 * rules
 * 70 % ranking personnalisé
 * 15 % exploration
 * 10 % nouveaux vendeurs
 * 5 % tendance
 * @param candidates
 */
function randomisationSelection(candidates){
    const totalWeight = candidates.reduce((sum, beat) => sum + beat.organicScore, 0);
    let random = Math.random() * totalWeight;

    for (const beat of candidates) {
        random -= beat.organicScore;
        if (random <= 0) return beat;
    }

    return candidates[0];
}

/**
 * fonction d'exploration controlée
 * @param candidates
 * @param limit
 */
function selectExplorationBeats(candidates, limit = 3) {
    const explorationPool = candidates.filter(beat =>
        beat.organicScore >= 0.35 &&
        beat.impressions < 100
    );

    const selected = [];

    while (selected.length < limit && explorationPool.length > 0) {
        const beat = randomisationSelection(explorationPool);
        selected.push(beat);
    }
    return selected;
}