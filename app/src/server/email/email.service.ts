import "server-only";

import { Prisma } from "../../../generated/prisma/client";
import type { EmailProviderClient, OrderEmailContext, TransactionalEmail } from "./email.types";
import {
  createEmailEvent,
  findChatUnreadReminderCandidates,
  findEmailAccountByClerkUserId,
  findEmailEventByDedupeKey,
  findOrderEmailContext,
  updateEmailEventStatus,
} from "./email.repository";
import { PostmarkEmailProvider } from "./postmark.provider";

const defaultProvider = new PostmarkEmailProvider();

/**
 * Echappe une valeur pour insertion HTML basique.
 * @param value Texte non fiable.
 */
function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Formate un montant dans sa devise.
 * @param value Montant decimal.
 * @param currency Code devise ISO.
 */
function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", {
    currency,
    style: "currency",
  }).format(value);
}

/**
 * Construit le greeting de base.
 * @param name Nom public nullable.
 */
function greeting(name: string | null) {
  return name ? `Bonjour ${name},` : "Bonjour,";
}

/**
 * Transforme le corps texte en HTML simple.
 * @param body Corps texte.
 */
function htmlFromText(body: string) {
  return `<p>${escapeHtml(body).replaceAll("\n", "<br />")}</p>`;
}

/**
 * Service transactionnel centralise. Ne doit etre appele que cote serveur.
 */
export class EmailService {
  constructor(private readonly provider: EmailProviderClient = defaultProvider) {}

  /**
   * Envoie un email rendu et journalise toujours l'evenement.
   * @param email Email transactionnel.
   */
  async send(email: TransactionalEmail) {
    const fromEmail = process.env.POSTMARK_FROM_EMAIL;

    if (email.dedupeKey) {
      const existing = await findEmailEventByDedupeKey(email.dedupeKey);

      if (existing) {
        return existing;
      }
    }

    const event = await createEmailEvent({
      recipientUserId: email.recipientUserId,
      toEmail: email.to.email,
      fromEmail,
      template: email.template,
      provider: "POSTMARK",
      subject: email.subject,
      dedupeKey: email.dedupeKey,
      metadataJson: email.metadata,
    });

    if (!fromEmail) {
      return updateEmailEventStatus({
        id: event.id,
        status: "SKIPPED",
        errorMessage: "postmark_from_email_missing",
      });
    }

    try {
      const result = await this.provider.send({
        fromEmail,
        toEmail: email.to.email,
        subject: email.subject,
        textBody: email.textBody,
        htmlBody: email.htmlBody,
        template: email.template,
        metadata: email.metadata,
      });

      return updateEmailEventStatus({
        id: event.id,
        status: "SENT",
        providerMessageId: result.providerMessageId,
        sentAt: new Date(),
      });
    } catch (error) {
      return updateEmailEventStatus({
        id: event.id,
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown email error.",
      });
    }
  }

  /**
   * Envoie la confirmation d'achat a l'acheteur.
   * @param order Commande payee.
   */
  async sendPurchaseConfirmed(order: OrderEmailContext) {
    const itemList = order.items.map((item) => `- ${item.title}`).join("\n");
    const textBody = `${greeting(order.buyer.displayName)}

Ton achat Universe est confirme.

Commande: ${order.id}
Total paye: ${formatMoney(order.totalAmount, order.currency)}

Instrumentales:
${itemList}

Tes fichiers sont disponibles depuis Mes achats.`;

    return this.send({
      to: {
        email: order.buyer.email,
        name: order.buyer.displayName,
      },
      subject: "Achat confirme sur Universe",
      textBody,
      htmlBody: htmlFromText(textBody),
      template: "PURCHASE_CONFIRMED",
      dedupeKey: `purchase.confirmed:${order.id}`,
      recipientUserId: order.buyer.id,
      metadata: {
        orderId: order.id,
      },
    });
  }

  /**
   * Envoie une confirmation de vente par vendeur concerne.
   * @param order Commande payee.
   */
  async sendSaleConfirmed(order: OrderEmailContext) {
    const itemsBySeller = new Map<string, OrderEmailContext["items"]>();

    for (const item of order.items) {
      if (!item.seller) {
        continue;
      }

      itemsBySeller.set(item.seller.id, [...(itemsBySeller.get(item.seller.id) ?? []), item]);
    }

    return Promise.all(
      Array.from(itemsBySeller.entries()).map(async ([sellerId, items]) => {
        const seller = items[0]?.seller;

        if (!seller) {
          return null;
        }

        const total = items.reduce((sum, item) => sum + item.lineTotalAmount, 0);
        const textBody = `${greeting(seller.displayName)}

Tu as une nouvelle vente sur Universe.

Commande: ${order.id}
Montant brut vendeur: ${formatMoney(total, order.currency)}

Instrumentales:
${items.map((item) => `- ${item.title}`).join("\n")}

Retrouve le detail dans ton dashboard vendeur.`;

        return this.send({
          to: {
            email: seller.email,
            name: seller.displayName,
          },
          subject: "Nouvelle vente sur Universe",
          textBody,
          htmlBody: htmlFromText(textBody),
          template: "SALE_CONFIRMED",
          dedupeKey: `sale.confirmed:${order.id}:${sellerId}`,
          recipientUserId: sellerId,
          metadata: {
            orderId: order.id,
            sellerId,
            orderItemIds: items.map((item) => item.id),
          },
        });
      }),
    );
  }

  /**
   * Envoie la confirmation d'acces vendeur.
   * @param clerkUserId Identifiant Clerk du compte.
   */
  async sendSellerAccessGranted(clerkUserId: string) {
    const account = await findEmailAccountByClerkUserId(clerkUserId);

    if (!account) {
      return null;
    }

    const textBody = `${greeting(account.profile?.displayName ?? null)}

Ton acces vendeur Universe est active.

Tu peux publier tes instrumentales, suivre tes ventes et gerer ton catalogue depuis ton compte.`;

    return this.send({
      to: {
        email: account.email,
        name: account.profile?.displayName ?? null,
      },
      subject: "Ton acces vendeur Universe est active",
      textBody,
      htmlBody: htmlFromText(textBody),
      template: "SELLER_ACCESS_GRANTED",
      dedupeKey: `seller.access.granted:${account.id}`,
      recipientUserId: account.id,
      metadata: {
        clerkUserId,
      },
    });
  }

  /**
   * Envoie les emails achat et vente apres paiement confirme.
   * @param orderId Identifiant commande payee.
   */
  async sendOrderConfirmedEmails(orderId: string) {
    const order = await findOrderEmailContext(orderId);

    if (!order) {
      return null;
    }

    const [purchase, sales] = await Promise.all([
      this.sendPurchaseConfirmed(order),
      this.sendSaleConfirmed(order),
    ]);

    return {
      purchase,
      sales,
    };
  }

  /**
   * Envoie les rappels chat pour messages non lus depuis au moins 24h.
   * @param now Date de reference.
   */
  async sendChatUnreadReminders(now = new Date()) {
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const candidates = await findChatUnreadReminderCandidates(cutoff);
    let sentOrRecorded = 0;

    for (const candidate of candidates) {
      const lastReadAt = candidate.lastReadAt ?? candidate.joinedAt;
      const latestUnread = candidate.conversation.messages.find(
        (message) =>
          message.senderId !== candidate.userId &&
          message.createdAt > lastReadAt &&
          message.createdAt <= cutoff,
      );

      if (!latestUnread) {
        continue;
      }

      const senderName = latestUnread.sender?.profile?.displayName ?? "Un utilisateur";
      const textBody = `${greeting(candidate.user.profile?.displayName ?? null)}

${senderName} t'a envoye un message sur Universe il y a plus de 24h.

Ouvre ta messagerie pour repondre.`;

      await this.send({
        to: {
          email: candidate.user.email,
          name: candidate.user.profile?.displayName ?? null,
        },
        subject: "Message non lu sur Universe",
        textBody,
        htmlBody: htmlFromText(textBody),
        template: "CHAT_UNREAD_REMINDER",
        dedupeKey: `chat.unread.reminder:${candidate.conversationId}:${candidate.userId}:${latestUnread.id}`,
        recipientUserId: candidate.userId,
        metadata: {
          conversationId: candidate.conversationId,
          latestUnreadMessageId: latestUnread.id,
          latestUnreadAt: latestUnread.createdAt.toISOString(),
        } satisfies Prisma.InputJsonObject,
      });
      sentOrRecorded += 1;
    }

    return {
      processed: candidates.length,
      sentOrRecorded,
    };
  }
}

export const emailService = new EmailService();
