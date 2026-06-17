import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
      "Provide exactly one purchase target.",
    );
    expect(() => parseCreateDirectPurchaseOrderInput([])).toThrow(
      "Invalid marketplace payload.",
    );
  });

  describe("Stripe checkout redirect URLs", () => {
    const originalAppUrl = process.env.APP_URL;

    beforeEach(() => {
      process.env.APP_URL = "https://example.com";
    });

    afterEach(() => {
      if (originalAppUrl === undefined) {
        delete process.env.APP_URL;
      } else {
        process.env.APP_URL = originalAppUrl;
      }
    });

    it("accepts URLs whose origin matches APP_URL", () => {
      expect(
        parseStripeCheckoutInput({
          successUrl: " https://example.com/success ",
          cancelUrl: "https://example.com/cancel",
        }),
      ).toEqual({
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      });

      expect(parseStripeCheckoutInput(null)).toEqual({});
    });

    it("rejects URLs targeting a different origin (audit C2)", () => {
      expect(() =>
        parseStripeCheckoutInput({ successUrl: "https://attacker.example/success" }),
      ).toThrow("successUrl origin is not allowed.");
      expect(() =>
        parseStripeCheckoutInput({ cancelUrl: "http://example.com/cancel" }),
      ).toThrow("cancelUrl origin is not allowed.");
    });

    it("rejects non-absolute URLs", () => {
      expect(() => parseStripeCheckoutInput({ successUrl: "/relative" })).toThrow(
        "successUrl must be an absolute http(s) URL.",
      );
    });

    it("fails closed when APP_URL is missing", () => {
      delete process.env.APP_URL;

      expect(() =>
        parseStripeCheckoutInput({ successUrl: "https://example.com/success" }),
      ).toThrow("successUrl cannot be validated: APP_URL is not configured.");
    });
  });

  it("normalizes optional Stripe confirmation session id", () => {
    expect(parseStripeConfirmationInput({ sessionId: " cs_test_123 " })).toEqual({
      sessionId: "cs_test_123",
    });
    expect(parseStripeConfirmationInput("")).toEqual({});
  });
});
