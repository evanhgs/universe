-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('BUYER', 'SELLER', 'ENGINEER', 'ADMIN', 'MODERATOR');

-- CreateEnum
CREATE TYPE "BeatStatus" AS ENUM ('DRAFT', 'PROCESSING', 'PUBLISHED', 'HIDDEN', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'UNLISTED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('AUDIO_SOURCE', 'AUDIO_PREVIEW', 'AUDIO_LICENSED_ARCHIVE', 'IMAGE_THUMBNAIL', 'IMAGE_BANNER', 'IMAGE_AVATAR', 'DOCUMENT_CONTRACT', 'DOCUMENT_KYC', 'OTHER');

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('S3', 'CLOUDFLARE_R2', 'AWS_S3', 'OTHER');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AudioProcessingJobType" AS ENUM ('PREVIEW_GENERATION');

-- CreateEnum
CREATE TYPE "LicenseScope" AS ENUM ('BASIC', 'PREMIUM', 'UNLIMITED', 'EXCLUSIVE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderItemType" AS ENUM ('BEAT_LICENSE', 'SUBSCRIPTION', 'SERVICE');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'PAYPAL', 'MANUAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('REQUIRES_ACTION', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('GROSS_SALE', 'PLATFORM_COMMISSION', 'SELLER_EARNING', 'REFUND', 'CHARGEBACK', 'ADJUSTMENT', 'TAX');

-- CreateEnum
CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('DIRECT', 'ORDER_SUPPORT', 'BEAT_INQUIRY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'SYSTEM', 'FILE');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('CLEAN', 'FLAGGED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SubscriptionInterval" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INACTIVE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReviewTargetType" AS ENUM ('SELLER', 'BUYER', 'ENGINEER', 'BEAT');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'GENERATED', 'SENT', 'SIGNED', 'VOID');

-- CreateEnum
CREATE TYPE "SignatureStatus" AS ENUM ('PENDING', 'SIGNED', 'DECLINED');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EmailTemplate" AS ENUM ('PURCHASE_CONFIRMED', 'SALE_CONFIRMED', 'SELLER_ACCESS_GRANTED', 'CHAT_UNREAD_REMINDER');

-- CreateEnum
CREATE TYPE "EmailEventStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('POSTMARK', 'SES');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT,
    "email" TEXT NOT NULL,
    "username" TEXT,
    "passwordHash" TEXT,
    "phoneE164" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "phoneVerifiedAt" TIMESTAMP(3),
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bio" TEXT,
    "countryCode" TEXT,
    "city" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "postalCode" TEXT,
    "avatarAssetId" TEXT,
    "bannerAssetId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "sellerRatingAvg" DECIMAL(3,2),
    "sellerRatingCount" INTEGER NOT NULL DEFAULT 0,
    "buyerRatingAvg" DECIMAL(3,2),
    "buyerRatingCount" INTEGER NOT NULL DEFAULT 0,
    "followerCount" INTEGER NOT NULL DEFAULT 0,
    "beatCount" INTEGER NOT NULL DEFAULT 0,
    "saleCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "RoleCode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "provider" "StorageProvider" NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalFilename" TEXT,
    "mimeType" TEXT,
    "extension" TEXT,
    "sizeBytes" BIGINT,
    "checksumSha256" TEXT,
    "assetType" "AssetType" NOT NULL,
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeatAssetLink" (
    "id" TEXT NOT NULL,
    "beatId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "role" "AssetType" NOT NULL,
    "licenseOfferingId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeatAssetLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Beat" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "bpm" INTEGER,
    "musicalKey" TEXT,
    "durationSec" INTEGER,
    "basePriceAmount" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "primaryGenre" TEXT,
    "primaryMood" TEXT,
    "tags" TEXT[],
    "status" "BeatStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'CLEAN',
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "brandingRequired" BOOLEAN NOT NULL DEFAULT false,
    "firstPublishedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Beat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AudioProcessingJob" (
    "id" TEXT NOT NULL,
    "type" "AudioProcessingJobType" NOT NULL DEFAULT 'PREVIEW_GENERATION',
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "beatId" TEXT NOT NULL,
    "sourceAssetId" TEXT NOT NULL,
    "outputAssetId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AudioProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "LicenseScope" NOT NULL,
    "description" TEXT,
    "allowStreaming" BOOLEAN NOT NULL DEFAULT true,
    "allowCommercialUse" BOOLEAN NOT NULL DEFAULT false,
    "allowBroadcast" BOOLEAN NOT NULL DEFAULT false,
    "allowDistribution" BOOLEAN NOT NULL DEFAULT false,
    "allowExclusiveTransfer" BOOLEAN NOT NULL DEFAULT false,
    "allowStemsDownload" BOOLEAN NOT NULL DEFAULT false,
    "maxStreams" INTEGER,
    "maxSales" INTEGER,
    "maxMusicVideos" INTEGER,
    "maxRadioStations" INTEGER,
    "contractTemplateId" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LicenseTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeatLicenseOffering" (
    "id" TEXT NOT NULL,
    "beatId" TEXT NOT NULL,
    "licenseTemplateId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "priceAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "stock" INTEGER,
    "customTermsJson" JSONB,
    "deliveryNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BeatLicenseOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "subtotalAmount" DECIMAL(10,2) NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "commissionAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "OrderItemType" NOT NULL DEFAULT 'BEAT_LICENSE',
    "beatId" TEXT,
    "beatLicenseOfferingId" TEXT,
    "sellerId" TEXT,
    "titleSnapshot" TEXT NOT NULL,
    "licenseNameSnapshot" TEXT,
    "unitAmount" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "lineTotalAmount" DECIMAL(10,2) NOT NULL,
    "rightsSnapshotJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "providerPaymentIntentId" TEXT,
    "providerChargeId" TEXT,
    "providerSessionId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "providerPayloadJson" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutLedgerEntry" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "orderItemId" TEXT,
    "sellerId" TEXT,
    "paymentId" TEXT,
    "type" "LedgerEntryType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "description" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadataJson" JSONB,

    CONSTRAINT "PayoutLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseEntitlement" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT,
    "beatId" TEXT,
    "beatLicenseOfferingId" TEXT,
    "status" "EntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "downloadLimit" INTEGER,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "accessGrantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "rightsSnapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "type" "ConversationType" NOT NULL DEFAULT 'DIRECT',
    "createdById" TEXT,
    "orderId" TEXT,
    "beatId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),
    "isMuted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "body" TEXT,
    "originalLanguage" TEXT,
    "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'CLEAN',
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "toEmail" TEXT NOT NULL,
    "fromEmail" TEXT,
    "template" "EmailTemplate" NOT NULL,
    "status" "EmailEventStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "EmailProvider" NOT NULL DEFAULT 'POSTMARK',
    "providerMessageId" TEXT,
    "subject" TEXT NOT NULL,
    "errorMessage" TEXT,
    "dedupeKey" TEXT,
    "metadataJson" JSONB,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeatViewEvent" (
    "id" TEXT NOT NULL,
    "beatId" TEXT NOT NULL,
    "viewerId" TEXT,
    "sessionId" TEXT,
    "source" TEXT,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "watchMs" INTEGER,

    CONSTRAINT "BeatViewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeatLike" (
    "id" TEXT NOT NULL,
    "beatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeatLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "beatId" TEXT,
    "orderId" TEXT,
    "targetType" "ReviewTargetType" NOT NULL,
    "rating" INTEGER NOT NULL,
    "communicationRating" INTEGER,
    "speedRating" INTEGER,
    "qualityRating" INTEGER,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "interval" "SubscriptionInterval" NOT NULL,
    "priceAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "reducedCommissionRateBp" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE',
    "providerSubscriptionId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'INACTIVE',
    "startedAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeatScoreSnapshot" (
    "id" TEXT NOT NULL,
    "beatId" TEXT NOT NULL,
    "score" DECIMAL(8,4) NOT NULL,
    "scoreVersion" TEXT NOT NULL,
    "inputsJson" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeatScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedContract" (
    "id" TEXT NOT NULL,
    "contractTemplateId" TEXT,
    "orderId" TEXT,
    "beatId" TEXT,
    "buyerId" TEXT,
    "sellerId" TEXT,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "renderedBody" TEXT,
    "pdfAssetId" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractSignature" (
    "id" TEXT NOT NULL,
    "generatedContractId" TEXT NOT NULL,
    "signerUserId" TEXT,
    "signerEmail" TEXT,
    "status" "SignatureStatus" NOT NULL DEFAULT 'PENDING',
    "signedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "providerRef" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RightsOrganization" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RightsOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BeatRightsRegistration" (
    "id" TEXT NOT NULL,
    "beatId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BeatRightsRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_slug_key" ON "UserProfile"("slug");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_role_idx" ON "UserRoleAssignment"("role");

-- CreateIndex
CREATE UNIQUE INDEX "UserRoleAssignment_userId_role_key" ON "UserRoleAssignment"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_objectKey_key" ON "MediaAsset"("objectKey");

-- CreateIndex
CREATE INDEX "BeatAssetLink_beatId_role_idx" ON "BeatAssetLink"("beatId", "role");

-- CreateIndex
CREATE INDEX "BeatAssetLink_licenseOfferingId_idx" ON "BeatAssetLink"("licenseOfferingId");

-- CreateIndex
CREATE UNIQUE INDEX "Beat_slug_key" ON "Beat"("slug");

-- CreateIndex
CREATE INDEX "Beat_ownerId_status_publishedAt_idx" ON "Beat"("ownerId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "Beat_status_visibility_publishedAt_idx" ON "Beat"("status", "visibility", "publishedAt");

-- CreateIndex
CREATE INDEX "Beat_primaryGenre_publishedAt_idx" ON "Beat"("primaryGenre", "publishedAt");

-- CreateIndex
CREATE INDEX "AudioProcessingJob_status_type_createdAt_idx" ON "AudioProcessingJob"("status", "type", "createdAt");

-- CreateIndex
CREATE INDEX "AudioProcessingJob_beatId_status_idx" ON "AudioProcessingJob"("beatId", "status");

-- CreateIndex
CREATE INDEX "AudioProcessingJob_lockedAt_idx" ON "AudioProcessingJob"("lockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseTemplate_code_key" ON "LicenseTemplate"("code");

-- CreateIndex
CREATE INDEX "BeatLicenseOffering_sellerId_isActive_idx" ON "BeatLicenseOffering"("sellerId", "isActive");

-- CreateIndex
CREATE INDEX "BeatLicenseOffering_beatId_isActive_priceAmount_idx" ON "BeatLicenseOffering"("beatId", "isActive", "priceAmount");

-- CreateIndex
CREATE UNIQUE INDEX "BeatLicenseOffering_beatId_licenseTemplateId_key" ON "BeatLicenseOffering"("beatId", "licenseTemplateId");

-- CreateIndex
CREATE INDEX "Order_buyerId_status_createdAt_idx" ON "Order"("buyerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_beatId_idx" ON "OrderItem"("beatId");

-- CreateIndex
CREATE INDEX "OrderItem_sellerId_idx" ON "OrderItem"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerPaymentIntentId_key" ON "Payment"("providerPaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerChargeId_key" ON "Payment"("providerChargeId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerSessionId_key" ON "Payment"("providerSessionId");

-- CreateIndex
CREATE INDEX "Payment_orderId_status_idx" ON "Payment"("orderId", "status");

-- CreateIndex
CREATE INDEX "Payment_buyerId_createdAt_idx" ON "Payment"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_provider_status_idx" ON "Payment"("provider", "status");

-- CreateIndex
CREATE INDEX "PayoutLedgerEntry_sellerId_occurredAt_idx" ON "PayoutLedgerEntry"("sellerId", "occurredAt");

-- CreateIndex
CREATE INDEX "PayoutLedgerEntry_type_occurredAt_idx" ON "PayoutLedgerEntry"("type", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseEntitlement_orderItemId_key" ON "PurchaseEntitlement"("orderItemId");

-- CreateIndex
CREATE INDEX "PurchaseEntitlement_buyerId_status_idx" ON "PurchaseEntitlement"("buyerId", "status");

-- CreateIndex
CREATE INDEX "PurchaseEntitlement_beatId_status_idx" ON "PurchaseEntitlement"("beatId", "status");

-- CreateIndex
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");

-- CreateIndex
CREATE INDEX "ConversationParticipant_userId_lastReadAt_idx" ON "ConversationParticipant"("userId", "lastReadAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_userId_key" ON "ConversationParticipant"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderId_createdAt_idx" ON "Message"("senderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailEvent_dedupeKey_key" ON "EmailEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "EmailEvent_recipientUserId_createdAt_idx" ON "EmailEvent"("recipientUserId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailEvent_template_status_createdAt_idx" ON "EmailEvent"("template", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EmailEvent_providerMessageId_idx" ON "EmailEvent"("providerMessageId");

-- CreateIndex
CREATE INDEX "BeatViewEvent_beatId_viewedAt_idx" ON "BeatViewEvent"("beatId", "viewedAt");

-- CreateIndex
CREATE INDEX "BeatViewEvent_viewerId_viewedAt_idx" ON "BeatViewEvent"("viewerId", "viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BeatLike_beatId_userId_key" ON "BeatLike"("beatId", "userId");

-- CreateIndex
CREATE INDEX "Follow_followedId_createdAt_idx" ON "Follow"("followedId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followedId_key" ON "Follow"("followerId", "followedId");

-- CreateIndex
CREATE INDEX "Review_targetUserId_createdAt_idx" ON "Review"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Review_beatId_createdAt_idx" ON "Review"("beatId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_providerSubscriptionId_key" ON "UserSubscription"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "UserSubscription_userId_status_idx" ON "UserSubscription"("userId", "status");

-- CreateIndex
CREATE INDEX "BeatScoreSnapshot_beatId_computedAt_idx" ON "BeatScoreSnapshot"("beatId", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContractTemplate_code_key" ON "ContractTemplate"("code");

-- CreateIndex
CREATE INDEX "KycVerification_userId_status_idx" ON "KycVerification"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RightsOrganization_code_key" ON "RightsOrganization"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BeatRightsRegistration_beatId_organizationId_key" ON "BeatRightsRegistration"("beatId", "organizationId");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_avatarAssetId_fkey" FOREIGN KEY ("avatarAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_bannerAssetId_fkey" FOREIGN KEY ("bannerAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRoleAssignment" ADD CONSTRAINT "UserRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeatAssetLink" ADD CONSTRAINT "BeatAssetLink_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeatAssetLink" ADD CONSTRAINT "BeatAssetLink_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeatAssetLink" ADD CONSTRAINT "BeatAssetLink_licenseOfferingId_fkey" FOREIGN KEY ("licenseOfferingId") REFERENCES "BeatLicenseOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beat" ADD CONSTRAINT "Beat_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioProcessingJob" ADD CONSTRAINT "AudioProcessingJob_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioProcessingJob" ADD CONSTRAINT "AudioProcessingJob_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AudioProcessingJob" ADD CONSTRAINT "AudioProcessingJob_outputAssetId_fkey" FOREIGN KEY ("outputAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseTemplate" ADD CONSTRAINT "LicenseTemplate_contractTemplateId_fkey" FOREIGN KEY ("contractTemplateId") REFERENCES "ContractTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeatLicenseOffering" ADD CONSTRAINT "BeatLicenseOffering_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeatLicenseOffering" ADD CONSTRAINT "BeatLicenseOffering_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeatLicenseOffering" ADD CONSTRAINT "BeatLicenseOffering_licenseTemplateId_fkey" FOREIGN KEY ("licenseTemplateId") REFERENCES "LicenseTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_beatLicenseOfferingId_fkey" FOREIGN KEY ("beatLicenseOfferingId") REFERENCES "BeatLicenseOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutLedgerEntry" ADD CONSTRAINT "PayoutLedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutLedgerEntry" ADD CONSTRAINT "PayoutLedgerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseEntitlement" ADD CONSTRAINT "PurchaseEntitlement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseEntitlement" ADD CONSTRAINT "PurchaseEntitlement_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseEntitlement" ADD CONSTRAINT "PurchaseEntitlement_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseEntitlement" ADD CONSTRAINT "PurchaseEntitlement_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseEntitlement" ADD CONSTRAINT "PurchaseEntitlement_beatLicenseOfferingId_fkey" FOREIGN KEY ("beatLicenseOfferingId") REFERENCES "BeatLicenseOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailEvent" ADD CONSTRAINT "EmailEvent_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeatViewEvent" ADD CONSTRAINT "BeatViewEvent_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeatLike" ADD CONSTRAINT "BeatLike_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeatLike" ADD CONSTRAINT "BeatLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followedId_fkey" FOREIGN KEY ("followedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeatScoreSnapshot" ADD CONSTRAINT "BeatScoreSnapshot_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedContract" ADD CONSTRAINT "GeneratedContract_contractTemplateId_fkey" FOREIGN KEY ("contractTemplateId") REFERENCES "ContractTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedContract" ADD CONSTRAINT "GeneratedContract_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedContract" ADD CONSTRAINT "GeneratedContract_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedContract" ADD CONSTRAINT "GeneratedContract_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_generatedContractId_fkey" FOREIGN KEY ("generatedContractId") REFERENCES "GeneratedContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycVerification" ADD CONSTRAINT "KycVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeatRightsRegistration" ADD CONSTRAINT "BeatRightsRegistration_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BeatRightsRegistration" ADD CONSTRAINT "BeatRightsRegistration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "RightsOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
