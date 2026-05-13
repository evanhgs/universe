import { describe, expect, it } from "vitest";

import {
  renderChatUnreadReminderEmail,
  renderPurchaseConfirmedEmail,
  renderSaleConfirmedEmail,
  renderSellerAccessGrantedEmail,
} from "@/server/email/email.templates";
import type { OrderEmailContext } from "@/server/email/email.types";

function orderContext(): OrderEmailContext {
  return {
    id: "order_<123>",
    currency: "EUR",
    totalAmount: 100,
    buyer: {
      id: "buyer_123",
      email: "buyer@example.com",
      displayName: "Buyer <Admin>",
    },
    items: [
      {
        id: "item_123",
        title: "Night <Ride>",
        lineTotalAmount: 70,
        seller: {
          id: "seller_123",
          email: "seller@example.com",
          displayName: "Seller <One>",
        },
        beat: {
          id: "beat_123",
          slug: "night-ride",
          title: "Night Ride",
        },
      },
      {
        id: "item_456",
        title: "Late Session",
        lineTotalAmount: 30,
        seller: {
          id: "seller_123",
          email: "seller@example.com",
          displayName: "Seller <One>",
        },
        beat: null,
      },
    ],
  };
}

describe("email templates", () => {
  it("renders a purchase confirmation with escaped HTML and order metadata", () => {
    const email = renderPurchaseConfirmedEmail(orderContext());

    expect(email.subject).toBe("Achat confirme sur Universe");
    expect(email.template).toBe("PURCHASE_CONFIRMED");
    expect(email.dedupeKey).toBe("purchase.confirmed:order_<123>");
    expect(email.recipientUserId).toBe("buyer_123");
    expect(email.metadata).toEqual({
      orderId: "order_<123>",
    });
    expect(email.textBody).toContain("Ton achat Universe est confirme.");
    expect(email.textBody).toContain("- Night <Ride>");
    expect(email.textBody).toMatch(/Total paye: 100,00/);
    expect(email.htmlBody).toContain("Universe");
    expect(email.htmlBody).toContain("Buyer &lt;Admin&gt;");
    expect(email.htmlBody).toContain("Night &lt;Ride&gt;");
    expect(email.htmlBody).not.toContain("<Ride>");
  });

  it("renders a sale confirmation for one seller", () => {
    const order = orderContext();
    const email = renderSaleConfirmedEmail(order, "seller_123", order.items);

    expect(email).toEqual(
      expect.objectContaining({
        subject: "Nouvelle vente sur Universe",
        template: "SALE_CONFIRMED",
        dedupeKey: "sale.confirmed:order_<123>:seller_123",
        recipientUserId: "seller_123",
      }),
    );
    expect(email?.to).toEqual({
      email: "seller@example.com",
      name: "Seller <One>",
    });
    expect(email?.metadata).toEqual({
      orderId: "order_<123>",
      sellerId: "seller_123",
      orderItemIds: ["item_123", "item_456"],
    });
    expect(email?.textBody).toContain("Montant brut vendeur:");
    expect(email?.htmlBody).toContain("Seller &lt;One&gt;");
    expect(email?.htmlBody).toContain("Night &lt;Ride&gt;");
  });

  it("renders seller access granted with the account target", () => {
    const email = renderSellerAccessGrantedEmail(
      {
        id: "seller_123",
        email: "seller@example.com",
        profile: {
          displayName: null,
        },
      },
      "clerk_123",
    );

    expect(email.to).toEqual({
      email: "seller@example.com",
      name: null,
    });
    expect(email.subject).toBe("Ton acces vendeur Universe est active");
    expect(email.template).toBe("SELLER_ACCESS_GRANTED");
    expect(email.dedupeKey).toBe("seller.access.granted:seller_123");
    expect(email.textBody).toContain("Bonjour,");
    expect(email.metadata).toEqual({
      clerkUserId: "clerk_123",
    });
  });

  it("renders unread chat reminders with escaped sender and stable metadata", () => {
    const createdAt = new Date("2026-01-02T11:00:00.000Z");
    const email = renderChatUnreadReminderEmail(
      {
        conversationId: "conv_123",
        userId: "recipient_123",
        user: {
          email: "recipient@example.com",
          profile: {
            displayName: "Recipient",
          },
        },
      },
      {
        id: "msg_123",
        createdAt,
        sender: {
          profile: {
            displayName: "Sender <Name>",
          },
        },
      },
    );

    expect(email.subject).toBe("Message non lu sur Universe");
    expect(email.template).toBe("CHAT_UNREAD_REMINDER");
    expect(email.dedupeKey).toBe("chat.unread.reminder:conv_123:recipient_123:msg_123");
    expect(email.textBody).toContain("Sender <Name> t'a envoye un message");
    expect(email.htmlBody).toContain("Sender &lt;Name&gt; t&#39;a envoye un message");
    expect(email.metadata).toEqual({
      conversationId: "conv_123",
      latestUnreadMessageId: "msg_123",
      latestUnreadAt: "2026-01-02T11:00:00.000Z",
    });
  });
});
