import { describe, expect, it } from "vitest";

import {
  parseCreateDirectPurchaseOrderInput,
  parseStripeCheckoutInput,
  parseStripeConfirmationInput,
} from "@/server/marketplace/marketplace.validation";

describe("marketplace validation", () => {
  it("normalizes direct purchase order criteria", () => {
    expect(parseCreateDirectPurchaseOrderInput({ beatSlug: " beat-one " })).toEqual({
      beatSlug: "beat-one",
      licenseOfferingId: undefined,
    });
    expect(parseCreateDirectPurchaseOrderInput({ licenseOfferingId: " lic_123 " })).toEqual({
      beatSlug: undefined,
      licenseOfferingId: "lic_123",
    });
  });

  it("requires a beat or license offering", () => {
    expect(() => parseCreateDirectPurchaseOrderInput({})).toThrow(
      "beatSlug or licenseOfferingId is required.",
    );
    expect(() => parseCreateDirectPurchaseOrderInput([])).toThrow(
      "Invalid marketplace payload.",
    );
  });

  it("accepts only absolute http checkout URLs", () => {
    expect(
      parseStripeCheckoutInput({
        successUrl: " https://example.com/success ",
        cancelUrl: "http://example.com/cancel",
      }),
    ).toEqual({
      successUrl: "https://example.com/success",
      cancelUrl: "http://example.com/cancel",
    });

    expect(parseStripeCheckoutInput(null)).toEqual({});
    expect(() => parseStripeCheckoutInput({ successUrl: "/relative" })).toThrow(
      "successUrl must be an absolute http(s) URL.",
    );
  });

  it("normalizes optional Stripe confirmation session id", () => {
    expect(parseStripeConfirmationInput({ sessionId: " cs_test_123 " })).toEqual({
      sessionId: "cs_test_123",
    });
    expect(parseStripeConfirmationInput("")).toEqual({});
  });
});
