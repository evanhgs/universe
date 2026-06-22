-- Publication programmee des beats : un beat peut etre laisse en prive puis
-- bascule automatiquement en public au jour J par le cron publish-scheduled.
-- Le statut SCHEDULED reste invisible du catalogue public (allowlist strict
-- status = PUBLISHED AND visibility = PUBLIC).
ALTER TYPE "BeatStatus" ADD VALUE 'SCHEDULED' BEFORE 'PUBLISHED';

ALTER TABLE "Beat" ADD COLUMN "scheduledPublishAt" TIMESTAMP(3);

CREATE INDEX "Beat_status_scheduledPublishAt_idx" ON "Beat"("status", "scheduledPublishAt");
