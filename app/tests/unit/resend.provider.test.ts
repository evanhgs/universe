import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResendEmailProvider } from "@/server/email/resend.provider";

describe("ResendEmailProvider", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
  });

  it("sends a transactional email through the official Resend client", async () => {
    const client = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: {
            id: "resend_123",
          },
          error: null,
          headers: null,
        }),
      },
    };
    const provider = new ResendEmailProvider(() => client);

    await expect(
      provider.send({
        fromEmail: "Universe <no-reply@example.com>",
        toEmail: "buyer@example.com",
        subject: "Achat confirme",
        textBody: "Merci",
        htmlBody: "<p>Merci</p>",
        template: "PURCHASE_CONFIRMED",
        dedupeKey: "purchase.confirmed:order_123",
        metadata: {
          orderId: "order_123",
          itemIds: ["item_123"],
        },
      }),
    ).resolves.toEqual({
      provider: "RESEND",
      providerMessageId: "resend_123",
    });

    expect(client.emails.send).toHaveBeenCalledWith(
      {
        from: "Universe <no-reply@example.com>",
        to: ["buyer@example.com"],
        subject: "Achat confirme",
        text: "Merci",
        html: "<p>Merci</p>",
        tags: [
          {
            name: "category",
            value: "purchase-confirmed",
          },
        ],
      },
      {
        idempotencyKey: "purchase.confirmed:order_123",
      },
    );
  });

  it("fails before creating a client when the API key is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const createClient = vi.fn();
    const provider = new ResendEmailProvider(createClient);

    await expect(
      provider.send({
        fromEmail: "no-reply@example.com",
        toEmail: "buyer@example.com",
        subject: "Achat confirme",
        textBody: "Merci",
        htmlBody: "<p>Merci</p>",
        template: "PURCHASE_CONFIRMED",
      }),
    ).rejects.toThrow("resend_api_key_missing");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("normalizes Resend API errors", async () => {
    const client = {
      emails: {
        send: vi.fn().mockResolvedValue({
          data: null,
          error: {
            name: "validation_error",
            message: "Invalid from address",
            statusCode: 422,
          },
          headers: null,
        }),
      },
    };
    const provider = new ResendEmailProvider(() => client);

    await expect(
      provider.send({
        fromEmail: "invalid",
        toEmail: "buyer@example.com",
        subject: "Achat confirme",
        textBody: "Merci",
        htmlBody: "<p>Merci</p>",
        template: "PURCHASE_CONFIRMED",
      }),
    ).rejects.toThrow("resend_error:422:validation_error:Invalid from address");
  });
});
