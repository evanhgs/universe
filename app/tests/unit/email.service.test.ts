import { beforeEach, describe, expect, it, vi } from "vitest";

const createEmailEventMock = vi.fn();
const findChatUnreadReminderCandidatesMock = vi.fn();
const findEmailAccountByClerkUserIdMock = vi.fn();
const findEmailEventByDedupeKeyMock = vi.fn();
const findOrderEmailContextMock = vi.fn();
const updateEmailEventStatusMock = vi.fn();

vi.mock("@/server/email/email.repository", () => ({
  createEmailEvent: createEmailEventMock,
  findChatUnreadReminderCandidates: findChatUnreadReminderCandidatesMock,
  findEmailAccountByClerkUserId: findEmailAccountByClerkUserIdMock,
  findEmailEventByDedupeKey: findEmailEventByDedupeKeyMock,
  findOrderEmailContext: findOrderEmailContextMock,
  updateEmailEventStatus: updateEmailEventStatusMock,
}));

function emailEvent() {
  return {
    id: "email_123",
    status: "PENDING",
  };
}

describe("EmailService", () => {
  beforeEach(() => {
    vi.stubEnv("POSTMARK_FROM_EMAIL", "Universe <no-reply@example.com>");
    createEmailEventMock.mockReset().mockResolvedValue(emailEvent());
    findChatUnreadReminderCandidatesMock.mockReset().mockResolvedValue([]);
    findEmailAccountByClerkUserIdMock.mockReset();
    findEmailEventByDedupeKeyMock.mockReset().mockResolvedValue(null);
    findOrderEmailContextMock.mockReset();
    updateEmailEventStatusMock.mockReset().mockImplementation((args) => Promise.resolve(args));
  });

  it("records a sent EmailEvent with the provider message id", async () => {
    const provider = {
      send: vi.fn().mockResolvedValue({
        provider: "POSTMARK",
        providerMessageId: "postmark_123",
      }),
    };
    const { EmailService } = await import("@/server/email/email.service");
    const service = new EmailService(provider);

    await service.send({
      to: { email: "buyer@example.com", name: "Buyer" },
      subject: "Achat confirme",
      textBody: "Merci",
      htmlBody: "<p>Merci</p>",
      template: "PURCHASE_CONFIRMED",
      dedupeKey: "purchase.confirmed:order_123",
      recipientUserId: "user_123",
      metadata: { orderId: "order_123" },
    });

    expect(createEmailEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: "buyer@example.com",
        fromEmail: "Universe <no-reply@example.com>",
        template: "PURCHASE_CONFIRMED",
      }),
    );
    expect(provider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        fromEmail: "Universe <no-reply@example.com>",
        toEmail: "buyer@example.com",
      }),
    );
    expect(updateEmailEventStatusMock).toHaveBeenCalledWith({
      id: "email_123",
      status: "SENT",
      providerMessageId: "postmark_123",
      sentAt: expect.any(Date),
    });
  });

  it("records skipped events when POSTMARK_FROM_EMAIL is missing", async () => {
    vi.stubEnv("POSTMARK_FROM_EMAIL", "");
    const provider = { send: vi.fn() };
    const { EmailService } = await import("@/server/email/email.service");
    const service = new EmailService(provider);

    await service.send({
      to: { email: "buyer@example.com" },
      subject: "Achat confirme",
      textBody: "Merci",
      htmlBody: "<p>Merci</p>",
      template: "PURCHASE_CONFIRMED",
    });

    expect(provider.send).not.toHaveBeenCalled();
    expect(updateEmailEventStatusMock).toHaveBeenCalledWith({
      id: "email_123",
      status: "SKIPPED",
      errorMessage: "postmark_from_email_missing",
    });
  });

  it("sends purchase and sale confirmations from an order context", async () => {
    const provider = {
      send: vi.fn().mockResolvedValue({
        provider: "POSTMARK",
        providerMessageId: "postmark_123",
      }),
    };
    findOrderEmailContextMock.mockResolvedValue({
      id: "order_123",
      currency: "EUR",
      totalAmount: 100,
      buyer: {
        id: "buyer_123",
        email: "buyer@example.com",
        displayName: "Buyer",
      },
      items: [
        {
          id: "item_123",
          title: "Night Ride",
          lineTotalAmount: 100,
          seller: {
            id: "seller_123",
            email: "seller@example.com",
            displayName: "Seller",
          },
          beat: {
            id: "beat_123",
            slug: "night-ride",
            title: "Night Ride",
          },
        },
      ],
    });
    const { EmailService } = await import("@/server/email/email.service");
    const service = new EmailService(provider);

    await service.sendOrderConfirmedEmails("order_123");

    expect(provider.send).toHaveBeenCalledTimes(2);
    expect(createEmailEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        template: "PURCHASE_CONFIRMED",
        dedupeKey: "purchase.confirmed:order_123",
      }),
    );
    expect(createEmailEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        template: "SALE_CONFIRMED",
        dedupeKey: "sale.confirmed:order_123:seller_123",
      }),
    );
  });

  it("sends unread chat reminders only for messages newer than lastReadAt and older than 24h", async () => {
    const provider = {
      send: vi.fn().mockResolvedValue({
        provider: "POSTMARK",
        providerMessageId: "postmark_123",
      }),
    };
    findChatUnreadReminderCandidatesMock.mockResolvedValue([
      {
        conversationId: "conv_123",
        userId: "recipient_123",
        joinedAt: new Date("2026-01-01T00:00:00.000Z"),
        lastReadAt: new Date("2026-01-01T12:00:00.000Z"),
        user: {
          id: "recipient_123",
          email: "recipient@example.com",
          profile: { displayName: "Recipient" },
        },
        conversation: {
          messages: [
            {
              id: "msg_123",
              senderId: "sender_123",
              createdAt: new Date("2026-01-02T11:00:00.000Z"),
              sender: {
                id: "sender_123",
                profile: { displayName: "Sender" },
              },
            },
          ],
        },
      },
    ]);
    const { EmailService } = await import("@/server/email/email.service");
    const service = new EmailService(provider);

    await expect(
      service.sendChatUnreadReminders(new Date("2026-01-03T12:00:00.000Z")),
    ).resolves.toEqual({
      processed: 1,
      sentOrRecorded: 1,
    });
    expect(createEmailEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        template: "CHAT_UNREAD_REMINDER",
        dedupeKey: "chat.unread.reminder:conv_123:recipient_123:msg_123",
      }),
    );
  });
});
