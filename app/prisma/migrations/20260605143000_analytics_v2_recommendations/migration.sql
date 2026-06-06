-- Analytics V2 recommendation tracking and aggregate tables.

ALTER TYPE "AnalyticsEventType" ADD VALUE 'SELLER_PROFILE_VIEW';
ALTER TYPE "AnalyticsEventType" ADD VALUE 'SELLER_FOLLOW';
ALTER TYPE "AnalyticsEventType" ADD VALUE 'SEARCH';
ALTER TYPE "AnalyticsEventType" ADD VALUE 'MESSAGE_SELLER';

ALTER TABLE "AnalyticsEvent" ADD COLUMN "sellerId" TEXT;
ALTER TABLE "AnalyticsEvent" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "AnalyticsEvent" ADD COLUMN "playPercentage" DECIMAL(5,4);
ALTER TABLE "AnalyticsEvent" ADD COLUMN "keyword" TEXT;

CREATE TABLE "BeatStats" (
    "id" TEXT NOT NULL,
    "beatId" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "plays" INTEGER NOT NULL DEFAULT 0,
    "pauses" INTEGER NOT NULL DEFAULT 0,
    "skips" INTEGER NOT NULL DEFAULT 0,
    "fullPlays" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "licenseClicks" INTEGER NOT NULL DEFAULT 0,
    "addToCart" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "conversionRate" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeatStats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserTasteProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "favoriteGenres" JSONB NOT NULL DEFAULT '{}',
    "favoriteMoods" JSONB NOT NULL DEFAULT '{}',
    "favoriteTags" JSONB NOT NULL DEFAULT '{}',
    "preferredBpmMin" INTEGER,
    "preferredBpmMax" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTasteProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SellerStats" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "averageRating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "responseRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "successfulOrders" INTEGER NOT NULL DEFAULT 0,
    "disputeRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerStats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BeatRecommendationScore" (
    "id" TEXT NOT NULL,
    "beatId" TEXT NOT NULL,
    "engagementScore" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "keywordScore" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "similarityScore" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "salesScore" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "freshnessScore" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "sellerScore" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "diversityScore" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "organicScore" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "reason" TEXT,
    "scoreVersion" TEXT NOT NULL,
    "inputsJson" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeatRecommendationScore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BeatStats_beatId_key" ON "BeatStats"("beatId");
CREATE INDEX "BeatStats_conversionRate_idx" ON "BeatStats"("conversionRate");

CREATE UNIQUE INDEX "UserTasteProfile_userId_key" ON "UserTasteProfile"("userId");

CREATE UNIQUE INDEX "SellerStats_sellerId_key" ON "SellerStats"("sellerId");

CREATE UNIQUE INDEX "BeatRecommendationScore_beatId_key" ON "BeatRecommendationScore"("beatId");
CREATE INDEX "BeatRecommendationScore_organicScore_computedAt_idx" ON "BeatRecommendationScore"("organicScore", "computedAt");

CREATE INDEX "AnalyticsEvent_sellerId_occurredAt_idx" ON "AnalyticsEvent"("sellerId", "occurredAt");

ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BeatStats" ADD CONSTRAINT "BeatStats_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserTasteProfile" ADD CONSTRAINT "UserTasteProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SellerStats" ADD CONSTRAINT "SellerStats_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BeatRecommendationScore" ADD CONSTRAINT "BeatRecommendationScore_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
