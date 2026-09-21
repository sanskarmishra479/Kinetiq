-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('setup', 'ready', 'generating', 'done', 'failed');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('screenshot', 'recording', 'logo', 'reference', 'designMd', 'other');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('pending', 'ready', 'rejected');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('generate', 'edit');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('pending', 'running', 'done', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "BucketSource" AS ENUM ('subscription', 'purchase', 'grant');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('grant', 'reserve', 'settle', 'refund', 'expire', 'clawback');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'past_due', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('succeeded', 'refunded', 'disputed');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,

    CONSTRAINT "two_factor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "ratio" TEXT NOT NULL,
    "model" TEXT,
    "templateId" TEXT,
    "prompt" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'setup',
    "settings" JSONB NOT NULL DEFAULT '{"voiceover":null,"design":null}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "ui" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "kind" "AssetKind" NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT,
    "durationSec" DOUBLE PRECISION,
    "status" "AssetStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_kit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "designMd" TEXT NOT NULL,
    "tokens" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_kit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "reservedCredits" INTEGER NOT NULL DEFAULT 0,
    "chargedCredits" INTEGER,
    "error" JSONB,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_step" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "node" TEXT NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "progress" JSONB,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "job_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "version" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "parentVersionId" TEXT,
    "jobId" TEXT,
    "videoKey" TEXT,
    "posterKey" TEXT,
    "durationSec" DOUBLE PRECISION,
    "freeEditsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scene" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "durationFrames" INTEGER NOT NULL,
    "qaReport" JSONB,

    CONSTRAINT "scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "previewKey" TEXT NOT NULL,
    "posterKey" TEXT NOT NULL,
    "ratios" TEXT[],
    "durations" INTEGER[],
    "creditDiscountPct" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "definition" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_slot" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "maxChars" INTEGER,

    CONSTRAINT "template_slot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_bucket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "BucketSource" NOT NULL,
    "granted" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "subscriptionId" TEXT,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_bucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LedgerType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "bucketId" TEXT,
    "jobId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dodoSubscriptionId" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dodoPaymentId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_event" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_cost" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "usdMicros" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_cost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flag" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "idempotency_record" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "two_factor_userId_idx" ON "two_factor"("userId");

-- CreateIndex
CREATE INDEX "project_userId_id_idx" ON "project"("userId", "id");

-- CreateIndex
CREATE INDEX "message_projectId_id_idx" ON "message"("projectId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "asset_storageKey_key" ON "asset"("storageKey");

-- CreateIndex
CREATE INDEX "asset_userId_id_idx" ON "asset"("userId", "id");

-- CreateIndex
CREATE INDEX "asset_projectId_idx" ON "asset"("projectId");

-- CreateIndex
CREATE INDEX "brand_kit_userId_id_idx" ON "brand_kit"("userId", "id");

-- CreateIndex
CREATE INDEX "job_userId_status_idx" ON "job"("userId", "status");

-- CreateIndex
CREATE INDEX "job_projectId_id_idx" ON "job"("projectId", "id");

-- CreateIndex
CREATE INDEX "job_status_deadlineAt_idx" ON "job"("status", "deadlineAt");

-- CreateIndex
CREATE UNIQUE INDEX "job_step_jobId_node_key" ON "job_step"("jobId", "node");

-- CreateIndex
CREATE UNIQUE INDEX "version_jobId_key" ON "version"("jobId");

-- CreateIndex
CREATE INDEX "version_userId_idx" ON "version"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "version_projectId_number_key" ON "version"("projectId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "scene_versionId_index_key" ON "scene"("versionId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "template_slug_key" ON "template"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "template_slot_templateId_key_key" ON "template_slot"("templateId", "key");

-- CreateIndex
CREATE INDEX "credit_bucket_userId_expiresAt_idx" ON "credit_bucket"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "credit_ledger_idempotencyKey_key" ON "credit_ledger"("idempotencyKey");

-- CreateIndex
CREATE INDEX "credit_ledger_userId_id_idx" ON "credit_ledger"("userId", "id");

-- CreateIndex
CREATE INDEX "credit_ledger_jobId_idx" ON "credit_ledger"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_dodoSubscriptionId_key" ON "subscription"("dodoSubscriptionId");

-- CreateIndex
CREATE INDEX "subscription_userId_idx" ON "subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_dodoPaymentId_key" ON "payment"("dodoPaymentId");

-- CreateIndex
CREATE INDEX "payment_userId_idx" ON "payment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_event_provider_eventId_key" ON "webhook_event"("provider", "eventId");

-- CreateIndex
CREATE INDEX "provider_cost_jobId_idx" ON "provider_cost"("jobId");

-- CreateIndex
CREATE INDEX "provider_cost_createdAt_idx" ON "provider_cost"("createdAt");

-- CreateIndex
CREATE INDEX "idempotency_record_expiresAt_idx" ON "idempotency_record"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_record_userId_key_key" ON "idempotency_record"("userId", "key");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message" ADD CONSTRAINT "message_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset" ADD CONSTRAINT "asset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_kit" ADD CONSTRAINT "brand_kit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_step" ADD CONSTRAINT "job_step_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version" ADD CONSTRAINT "version_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version" ADD CONSTRAINT "version_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "version" ADD CONSTRAINT "version_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scene" ADD CONSTRAINT "scene_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_slot" ADD CONSTRAINT "template_slot_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_bucket" ADD CONSTRAINT "credit_bucket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "credit_bucket"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_cost" ADD CONSTRAINT "provider_cost_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_record" ADD CONSTRAINT "idempotency_record_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Safety rules the Prisma schema language can't express (hand-written).
-- These are the last line of defense: even buggy app code can't break them.
-- ─────────────────────────────────────────────────────────────────────────────

-- Projects: only the supported formats (FR-PRJ-01).
ALTER TABLE "project" ADD CONSTRAINT "project_ratio_check" CHECK ("ratio" IN ('16:9', '9:16', '1:1'));
ALTER TABLE "project" ADD CONSTRAINT "project_duration_check" CHECK ("durationSec" IN (15, 30, 45));

-- Assets: positive sizes, only safe types (FR-PRJ-04, NFR-SEC-10).
ALTER TABLE "asset" ADD CONSTRAINT "asset_size_check" CHECK ("size" > 0);
ALTER TABLE "asset" ADD CONSTRAINT "asset_mime_check"
  CHECK ("mime" IN ('image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm', 'text/markdown'));

-- Jobs and versions.
ALTER TABLE "job" ADD CONSTRAINT "job_reserved_check" CHECK ("reservedCredits" >= 0);
ALTER TABLE "job" ADD CONSTRAINT "job_charged_check"
  CHECK ("chargedCredits" IS NULL OR ("chargedCredits" >= 0 AND "chargedCredits" <= "reservedCredits"));
ALTER TABLE "version" ADD CONSTRAINT "version_number_check" CHECK ("number" >= 1);
ALTER TABLE "version" ADD CONSTRAINT "version_free_edits_check" CHECK ("freeEditsUsed" >= 0);
ALTER TABLE "scene" ADD CONSTRAINT "scene_index_check" CHECK ("index" >= 0);
ALTER TABLE "scene" ADD CONSTRAINT "scene_duration_check" CHECK ("durationFrames" > 0);

-- Credits: buckets never go negative or above what was granted (FR-CRD-02..07).
ALTER TABLE "credit_bucket" ADD CONSTRAINT "credit_bucket_granted_check" CHECK ("granted" > 0);
ALTER TABLE "credit_bucket" ADD CONSTRAINT "credit_bucket_remaining_check"
  CHECK ("remaining" >= 0 AND "remaining" <= "granted");

-- Ledger amounts: never zero; grants/refunds add, reserves/expiries/clawbacks subtract.
-- ("settle" can be either sign; it's the correction between reserved and actual.)
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_amount_check" CHECK (
  "amount" <> 0 AND (
    ("type" IN ('grant', 'refund') AND "amount" > 0) OR
    ("type" IN ('reserve', 'expire', 'clawback') AND "amount" < 0) OR
    ("type" = 'settle')
  )
);

-- The ledger is append-only: history can never be edited or erased by the app.
-- (Deleting a whole user still works: the cascade path is allowed by owner-only
-- privileges in production, and this trigger only blocks UPDATE.)
CREATE FUNCTION "credit_ledger_block_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'credit_ledger is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "credit_ledger_no_update"
  BEFORE UPDATE ON "credit_ledger"
  FOR EACH ROW EXECUTE FUNCTION "credit_ledger_block_update"();

-- Money is positive; provider costs are non-negative.
ALTER TABLE "payment" ADD CONSTRAINT "payment_amount_check" CHECK ("amountCents" > 0);
ALTER TABLE "provider_cost" ADD CONSTRAINT "provider_cost_check" CHECK ("units" >= 0 AND "usdMicros" >= 0);
ALTER TABLE "template" ADD CONSTRAINT "template_discount_check" CHECK ("creditDiscountPct" BETWEEN 0 AND 90);
