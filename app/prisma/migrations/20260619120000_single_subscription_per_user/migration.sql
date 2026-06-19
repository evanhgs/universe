-- Keep the most relevant local subscription per user before enforcing the
-- one-subscription-per-user invariant. Stripe remains the billing source of
-- truth; historical duplicates stay available in Stripe's Customer Portal.
WITH ranked_subscriptions AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId"
      ORDER BY
        CASE "status"
          WHEN 'ACTIVE' THEN 0
          WHEN 'TRIALING' THEN 1
          WHEN 'PAST_DUE' THEN 2
          ELSE 3
        END,
        "currentPeriodEnd" DESC NULLS LAST,
        "updatedAt" DESC
    ) AS row_number
  FROM "UserSubscription"
)
DELETE FROM "UserSubscription"
WHERE "id" IN (
  SELECT "id"
  FROM ranked_subscriptions
  WHERE row_number > 1
);

DROP INDEX IF EXISTS "UserSubscription_userId_status_idx";
CREATE UNIQUE INDEX "UserSubscription_userId_key" ON "UserSubscription"("userId");
CREATE INDEX "UserSubscription_status_idx" ON "UserSubscription"("status");
