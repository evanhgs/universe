-- Creator dashboard V2: negotiated exclusive licenses, seller promotions and
-- discount snapshots for auditable marketplace orders.

CREATE TYPE "ExclusiveOfferStatus" AS ENUM (
  'PENDING',
  'COUNTERED',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'PAID'
);

CREATE TYPE "PromotionType" AS ENUM (
  'COUPON',
  'BUNDLE'
);

CREATE TYPE "PromotionDiscountType" AS ENUM (
  'PERCENT',
  'FIXED'
);

CREATE TABLE "ExclusiveLicenseOffer" (
  "id" TEXT NOT NULL,
  "beatId" TEXT NOT NULL,
  "beatLicenseOfferingId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "status" "ExclusiveOfferStatus" NOT NULL DEFAULT 'PENDING',
  "proposedAmount" DECIMAL(10,2) NOT NULL,
  "counterAmount" DECIMAL(10,2),
  "acceptedAmount" DECIMAL(10,2),
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "buyerMessage" TEXT,
  "sellerMessage" TEXT,
  "expiresAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExclusiveLicenseOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Promotion" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "type" "PromotionType" NOT NULL,
  "discountType" "PromotionDiscountType" NOT NULL,
  "title" TEXT NOT NULL,
  "code" TEXT,
  "discountValue" DECIMAL(10,2) NOT NULL,
  "currency" TEXT,
  "minItems" INTEGER NOT NULL DEFAULT 1,
  "usageLimit" INTEGER,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "scopeJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Order" ADD COLUMN "negotiatedOfferId" TEXT;
ALTER TABLE "Order" ADD COLUMN "promotionId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "promotionSnapshotJson" JSONB;

CREATE UNIQUE INDEX "Order_negotiatedOfferId_key" ON "Order"("negotiatedOfferId");
CREATE UNIQUE INDEX "Promotion_sellerId_code_key" ON "Promotion"("sellerId", "code");
CREATE INDEX "ExclusiveLicenseOffer_sellerId_status_createdAt_idx" ON "ExclusiveLicenseOffer"("sellerId", "status", "createdAt");
CREATE INDEX "ExclusiveLicenseOffer_buyerId_status_createdAt_idx" ON "ExclusiveLicenseOffer"("buyerId", "status", "createdAt");
CREATE INDEX "ExclusiveLicenseOffer_beatId_status_idx" ON "ExclusiveLicenseOffer"("beatId", "status");
CREATE INDEX "Promotion_sellerId_isActive_type_idx" ON "Promotion"("sellerId", "isActive", "type");
CREATE INDEX "Promotion_code_idx" ON "Promotion"("code");
CREATE INDEX "Order_promotionId_idx" ON "Order"("promotionId");

ALTER TABLE "ExclusiveLicenseOffer" ADD CONSTRAINT "ExclusiveLicenseOffer_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExclusiveLicenseOffer" ADD CONSTRAINT "ExclusiveLicenseOffer_beatLicenseOfferingId_fkey" FOREIGN KEY ("beatLicenseOfferingId") REFERENCES "BeatLicenseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExclusiveLicenseOffer" ADD CONSTRAINT "ExclusiveLicenseOffer_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExclusiveLicenseOffer" ADD CONSTRAINT "ExclusiveLicenseOffer_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_negotiatedOfferId_fkey" FOREIGN KEY ("negotiatedOfferId") REFERENCES "ExclusiveLicenseOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
