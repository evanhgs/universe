import "server-only";

import type {
  EntitlementStatus,
  OrderStatus,
  PaymentStatus,
} from "../../../generated/prisma/enums";

export type CreateDirectPurchaseOrderInput = {
  beatSlug?: string;
  licenseOfferingId?: string;
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
