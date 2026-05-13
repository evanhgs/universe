import { beforeEach, describe, expect, it, vi } from "vitest";

import { PostmarkEmailProvider } from "@/server/email/postmark.provider";

describe("PostmarkEmailProvider", () => {
  beforeEach(() => {
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "server-token");
    vi.stubEnv("POSTMARK_MESSAGE_STREAM", "");
  });

  it("sends a transactional email through the official Postmark client", async () => {
    const client = {
      sendEmail: vi.fn().mockResolvedValue({
        MessageID: "postmark_123",
      }),
    };
    const provider = new PostmarkEmailProvider(() => client);

    await expect(
      provider.send({
        fromEmail: "Universe <no-reply@example.com>",
        toEmail: "buyer@example.com",
        subject: "Achat confirme",
        textBody: "Merci",
        htmlBody: "<p>Merci</p>",
        template: "PURCHASE_CONFIRMED",
        metadata: {
          orderId: "order_123",
          itemIds: ["item_123"],
        },
      }),
    ).resolves.toEqual({
      provider: "POSTMARK",
      providerMessageId: "postmark_123",
    });

    expect(client.sendEmail).toHaveBeenCalledWith({
      From: "Universe <no-reply@example.com>",
      To: "buyer@example.com",
      Subject: "Achat confirme",
      TextBody: "Merci",
      HtmlBody: "<p>Merci</p>",
      Tag: "purchase.confirmed",
      Metadata: {
        orderId: "order_123",
        itemIds: JSON.stringify(["item_123"]),
      },
      MessageStream: "outbound",
    });
  });

  it("uses a configured Postmark message stream when provided", async () => {
    vi.stubEnv("POSTMARK_MESSAGE_STREAM", "transactional");
    const client = {
      sendEmail: vi.fn().mockResolvedValue({
        MessageID: "postmark_456",
      }),
    };
    const provider = new PostmarkEmailProvider(() => client);

    await provider.send({
      fromEmail: "no-reply@example.com",
      toEmail: "seller@example.com",
      subject: "Nouvelle vente",
      textBody: "Vente",
      htmlBody: "<p>Vente</p>",
      template: "SALE_CONFIRMED",
    });

    expect(client.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        MessageStream: "transactional",
      }),
    );
  });

  it("fails before creating a client when the server token is missing", async () => {
    vi.stubEnv("POSTMARK_SERVER_TOKEN", "");
    const createClient = vi.fn();
    const provider = new PostmarkEmailProvider(createClient);

    await expect(
      provider.send({
        fromEmail: "no-reply@example.com",
        toEmail: "buyer@example.com",
        subject: "Achat confirme",
        textBody: "Merci",
        htmlBody: "<p>Merci</p>",
        template: "PURCHASE_CONFIRMED",
      }),
    ).rejects.toThrow("postmark_server_token_missing");
    expect(createClient).not.toHaveBeenCalled();
  });
});
