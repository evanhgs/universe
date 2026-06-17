import "server-only";

import type {
  ExclusiveOfferStatus,
  EntitlementStatus,
  KycStatus,
  OrderStatus,
  PaymentStatus,
  PromotionDiscountType,
  PromotionType,
} from "../../../generated/prisma/enums";

export type CreateDirectPurchaseOrderInput = {
  beatSlug?: string;
  licenseOfferingId?: string;
  exclusiveOfferId?: string;
  items?: Array<{
    licenseOfferingId: string;
    quantity?: number;
  }>;
  promotionCode?: string;
};

export type CreateExclusiveOfferInput = {
  beatLicenseOfferingId: string;
  proposedAmount: number;
  buyerMessage?: string;
};

export type UpdateExclusiveOfferInput = {
  action: "accept" | "reject" | "counter";
  counterAmount?: number;
  sellerMessage?: string;
};

export type CreatePromotionInput = {
  type: PromotionType;
  discountType: PromotionDiscountType;
  title: string;
  code?: string;
  discountValue: number;
  currency?: string;
  minItems?: number;
  usageLimit?: number;
  startsAt?: string;
  endsAt?: string;
  scope?: {
    beatIds?: string[];
    licenseOfferingIds?: string[];
  };
};

export type UpdatePromotionInput = Partial<CreatePromotionInput> & {
  isActive?: boolean;
};

export type StripeCheckoutInput = {
  successUrl?: string;
  cancelUrl?: string;
};

export type StripeConfirmationInput = {
  sessionId?: string;
};

export type MarketplaceAssetPayload = {
  id: string;
  role: string;
  url: string;
  expiresIn: number;
  originalFilename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type MarketplaceOrderPayload = {
  id: string;
  status: OrderStatus;
  currency: string;
  subtotalAmount: number;
  commissionAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    type: string;
    beatLicenseOfferingId: string | null;
    title: string;
    licenseName: string | null;
    unitAmount: number;
    quantity: number;
    lineTotalAmount: number;
    beat: {
      id: string;
      slug: string;
      title: string;
    } | null;
    seller: {
      id: string;
      slug: string | null;
      displayName: string | null;
    } | null;
  }>;
  payments?: Array<{
    id: string;
    provider: string;
    status: PaymentStatus;
    amount: number;
    currency: string;
    providerSessionId: string | null;
    paidAt: string | null;
    createdAt: string;
  }>;
  entitlements?: Array<{
    id: string;
    status: EntitlementStatus;
    beatId: string | null;
    beatLicenseOfferingId: string | null;
    downloadLimit: number | null;
    downloadCount: number;
    accessGrantedAt: string | null;
    expiresAt: string | null;
  }>;
};

export type SellerRevenueCurrencyPayload = {
  currency: string;
  grossPaidAmount: number;
  platformCommissionAmount: number;
  sellerEarningAmount: number;
};

export type SellerBeatPayload = {
  id: string;
  slug: string;
  title: string;
  status: string;
  visibility: string;
  priceAmount: number | null;
  currency: string;
  publishedAt: string | null;
  updatedAt: string;
  paidSalesCount: number;
};

export type SellerAnalyticsSummaryPayload = {
  impressions: number;
  plays: number;
  fullPlays: number;
  licenseClicks: number;
  addToCart: number;
  purchases: number;
  revenue: number;
  playRate: number;
  licenseClickRate: number;
  conversionRate: number;
};

export type SellerBeatPerformancePayload = SellerBeatPayload & {
  impressions: number;
  plays: number;
  fullPlays: number;
  licenseClicks: number;
  addToCart: number;
  purchases: number;
  revenue: number;
  conversionRate: number;
};

export type ExclusiveOfferPayload = {
  id: string;
  status: ExclusiveOfferStatus;
  proposedAmount: number;
  counterAmount: number | null;
  acceptedAmount: number | null;
  currency: string;
  buyerMessage: string | null;
  sellerMessage: string | null;
  expiresAt: string | null;
  createdAt: string;
  beat: {
    id: string;
    slug: string;
    title: string;
  };
  buyer: {
    id: string;
    displayName: string | null;
  };
};

export type PromotionPayload = {
  id: string;
  type: PromotionType;
  discountType: PromotionDiscountType;
  title: string;
  code: string | null;
  discountValue: number;
  currency: string | null;
  minItems: number;
  usageLimit: number | null;
  usageCount: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

export type SellerDashboardPayload = {
  items: Array<{
    id: string;
    orderId: string;
    orderStatus: string;
    paymentStatus: string | null;
    title: string;
    licenseName: string | null;
    unitAmount: number;
    quantity: number;
    lineTotalAmount: number;
    currency: string;
    createdAt: string;
    paidAt: string | null;
    beat: {
      id: string;
      slug: string;
      title: string;
    } | null;
  }>;
  count: number;
  summary: {
    paidSalesCount: number;
    orderLineCount: number;
    beatCount: number;
    publishedBeatCount: number;
    draftBeatCount: number;
    processingBeatCount: number;
    hiddenBeatCount: number;
    revenueByCurrency: SellerRevenueCurrencyPayload[];
    payoutEligibility: {
      canReceivePayouts: boolean;
      kycStatus: KycStatus | null;
      payoutAccountReady: boolean;
      reason: string | null;
    };
  };
  beats: SellerBeatPayload[];
  analyticsSummary: SellerAnalyticsSummaryPayload;
  beatPerformance: SellerBeatPerformancePayload[];
  exclusiveOffers: ExclusiveOfferPayload[];
  promotions: PromotionPayload[];
};
