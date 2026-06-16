-- Stripe Billing customer and subscription catalog identifiers.
ALTER TABLE "User"
ADD COLUMN "stripeCustomerId" TEXT;

ALTER TABLE "SubscriptionPlan"
ADD COLUMN "stripePriceId" TEXT;

-- Marketplace commission must be frozen per order line because the seller
-- subscription can change between order creation and Stripe fulfillment.
ALTER TABLE "OrderItem"
ADD COLUMN "commissionRateBpSnapshot" INTEGER NOT NULL DEFAULT 3000;

CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX "SubscriptionPlan_stripePriceId_key" ON "SubscriptionPlan"("stripePriceId");
