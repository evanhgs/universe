import "server-only";

import type { EmailProviderClient, OrderEmailContext, TransactionalEmail } from "./email.types";
import {
  createEmailEvent,
  findChatUnreadReminderCandidates,
  findEmailAccountByClerkUserId,
  findEmailEventByDedupeKey,
  findOrderEmailContext,
  updateEmailEventStatus,
} from "./email.repository";
import {
  renderChatUnreadReminderEmail,
  renderPurchaseConfirmedEmail,
  renderSaleConfirmedEmail,
  renderSellerAccessGrantedEmail,
} from "./email.templates";
import { ResendEmailProvider } from "./resend.provider";

const defaultProvider = new ResendEmailProvider();

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
    const fromEmail = process.env.RESEND_EMAIL_FROM;

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
      provider: "RESEND",
      subject: email.subject,
      dedupeKey: email.dedupeKey,
      metadataJson: email.metadata,
    });

    if (!fromEmail) {
      return updateEmailEventStatus({
        id: event.id,
        status: "SKIPPED",
        errorMessage: "resend_email_from_missing",
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
        dedupeKey: email.dedupeKey,
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
    return this.send(renderPurchaseConfirmedEmail(order));
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
        const email = renderSaleConfirmedEmail(order, sellerId, items);

        if (!email) {
          return null;
        }

        return this.send(email);
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

    return this.send(renderSellerAccessGrantedEmail(account, clerkUserId));
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

      await this.send(renderChatUnreadReminderEmail(candidate, latestUnread));
      sentOrRecorded += 1;
    }

    return {
      processed: candidates.length,
      sentOrRecorded,
    };
  }
}

export const emailService = new EmailService();
