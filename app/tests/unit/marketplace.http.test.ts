import { describe, expect, it } from "vitest";

import { marketplaceErrorResponse } from "@/server/marketplace/marketplace.http";

async function json(response: Response) {
  return response.json() as Promise<{ error: string; message: string }>;
}

describe("marketplace error response", () => {
  it.each([
    ["beat_forbidden", 403],
    ["beat_or_license_not_found", 404],
    ["already_purchased", 409],
    ["stripe_session_not_paid", 402],
    ["stripe_not_configured", 503],
    ["unknown_validation", 400],
  ])("maps %s to HTTP %i", async (code, status) => {
    const response = marketplaceErrorResponse(new Error(code));

    expect(response.status).toBe(status);
    expect(await json(response)).toEqual({ error: code, message: code });
  });

  it("normalizes Stripe provider errors", async () => {
    const response = marketplaceErrorResponse(new Error("stripe_error:card_declined"));

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({
      error: "stripe_error",
      message: "stripe_error:card_declined",
    });
  });
});
