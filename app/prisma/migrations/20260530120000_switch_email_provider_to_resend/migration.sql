ALTER TYPE "EmailProvider" RENAME TO "EmailProvider_old";

CREATE TYPE "EmailProvider" AS ENUM ('RESEND');

ALTER TABLE "EmailEvent" ALTER COLUMN "provider" DROP DEFAULT;
ALTER TABLE "EmailEvent"
  ALTER COLUMN "provider" TYPE "EmailProvider"
  USING 'RESEND'::"EmailProvider";
ALTER TABLE "EmailEvent" ALTER COLUMN "provider" SET DEFAULT 'RESEND';

DROP TYPE "EmailProvider_old";
