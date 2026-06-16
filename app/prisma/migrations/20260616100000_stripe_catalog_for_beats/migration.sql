-- CreateEnum
CREATE TYPE "StripeCatalogSyncStatus" AS ENUM ('NOT_SYNCED', 'SYNCING', 'SYNCED', 'FAILED');

-- Beat-level Stripe Product sync state.
ALTER TABLE "Beat"
ADD COLUMN "stripeProductId" TEXT,
ADD COLUMN "stripeSyncStatus" "StripeCatalogSyncStatus" NOT NULL DEFAULT 'NOT_SYNCED',
ADD COLUMN "stripeSyncedAt" TIMESTAMP(3),
ADD COLUMN "stripeSyncError" TEXT;

-- Offering-level Stripe Price sync state. Product ownership moves to Beat.
ALTER TABLE "BeatLicenseOffering"
DROP COLUMN IF EXISTS "stripeProductId";

ALTER TABLE "BeatLicenseOffering"
ADD COLUMN IF NOT EXISTS "stripePriceId" TEXT;

ALTER TABLE "BeatLicenseOffering"
ALTER COLUMN "stripePriceId" DROP NOT NULL;

ALTER TABLE "BeatLicenseOffering"
ADD COLUMN "stripePriceActive" BOOLEAN NOT NULL DEFAULT false;

-- Checkout uses a frozen Stripe Price snapshot from the order line.
ALTER TABLE "OrderItem"
ADD COLUMN "stripePriceIdSnapshot" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Beat_stripeProductId_key" ON "Beat"("stripeProductId");
CREATE UNIQUE INDEX IF NOT EXISTS "BeatLicenseOffering_stripePriceId_key" ON "BeatLicenseOffering"("stripePriceId");
