import "server-only";

import { Prisma } from "../../../generated/prisma/client";
import type { OrderEmailContext, SubscriptionEmailContext, TransactionalEmail } from "./email.types";

export type SellerAccessGrantedAccount = {
  id: string;
  email: string;
  profile: {
    displayName: string | null;
  } | null;
};

export type ChatUnreadReminderCandidate = {
  conversationId: string;
  userId: string;
  user: {
    email: string;
    profile: {
      displayName: string | null;
    } | null;
  };
};

export type ChatUnreadReminderMessage = {
  id: string;
  createdAt: Date;
  sender: {
    profile: {
      displayName: string | null;
    } | null;
  } | null;
};

type LayoutRow = {
  label: string;
  value: string;
};

type EmailLayoutInput = {
  preheader: string;
  title: string;
  intro: string[];
  rows?: LayoutRow[];
  listTitle?: string;
  listItems?: string[];
  outro?: string[];
};

/**
 * Echappe une valeur pour insertion HTML.
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

function renderParagraphs(values: string[]) {
  return values
    .map(
      (value) =>
        `<p style="margin:0 0 14px;color:#3f3f46;font-size:15px;line-height:1.65;font-weight:400;">${escapeHtml(
          value,
        )}</p>`,
    )
    .join("");
}

function renderRows(rows: LayoutRow[] | undefined) {
  if (!rows?.length) {
    return "";
  }

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:10px 0 26px;border-collapse:separate;border-spacing:0;border:1px solid #e5e5ea;border-radius:16px;overflow:hidden;background:#ffffff;">
${rows
  .map(
    (row, index) => `<tr>
  <td style="padding:14px 16px;background:#fbfbfd;border-bottom:${index === rows.length - 1 ? "0" : "1px solid #e5e5ea"};color:#6e6e73;font-size:12px;font-weight:600;letter-spacing:0.01em;">${escapeHtml(
    row.label,
  )}</td>
  <td style="padding:14px 16px;border-bottom:${index === rows.length - 1 ? "0" : "1px solid #e5e5ea"};color:#1d1d1f;font-size:14px;font-weight:500;text-align:right;">${escapeHtml(
    row.value,
  )}</td>
</tr>`,
  )
  .join("")}
</table>`;
}

function renderList(title: string | undefined, items: string[] | undefined) {
  if (!title || !items?.length) {
    return "";
  }

  return `<div style="margin:2px 0 26px;">
  <p style="margin:0 0 12px;color:#1d1d1f;font-size:14px;font-weight:700;">${escapeHtml(
    title,
  )}</p>
  <ul style="margin:0;padding:0 0 0 19px;color:#3f3f46;font-size:14px;line-height:1.65;">
${items.map((item) => `    <li>${escapeHtml(item)}</li>`).join("\n")}
  </ul>
</div>`;
}

function renderEmailLayout(input: EmailLayoutInput) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(
      input.preheader,
    )}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f5f5f7;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;border-collapse:separate;border-spacing:0;">
            <tr>
              <td style="padding:0 8px 18px;text-align:center;">
                <div style="color:#1d1d1f;font-size:20px;font-weight:700;letter-spacing:-0.01em;">Universe</div>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 34px 30px;background:#ffffff;border:1px solid #e5e5ea;border-radius:28px;box-shadow:0 18px 48px rgba(0,0,0,0.06);">
                <h1 style="margin:0 0 18px;color:#1d1d1f;font-size:28px;line-height:1.18;font-weight:700;letter-spacing:-0.02em;">${escapeHtml(
                  input.title,
                )}</h1>
                ${renderParagraphs(input.intro)}
                ${renderRows(input.rows)}
                ${renderList(input.listTitle, input.listItems)}
                ${renderParagraphs(input.outro ?? [])}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 26px 0;text-align:center;color:#86868b;font-size:12px;line-height:1.55;">
                Email transactionnel Universe. Tu le recois car une action liee a ton compte vient d'etre effectuee.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Rend la confirmation d'achat a l'acheteur.
 * @param order Commande payee.
 */
export function renderPurchaseConfirmedEmail(order: OrderEmailContext): TransactionalEmail {
  const itemList = order.items.map((item) => `- ${item.title}`).join("\n");
  const total = formatMoney(order.totalAmount, order.currency);
  const textBody = `${greeting(order.buyer.displayName)}

Votre achat a été confirmé.

Commande: ${order.id}
Total payé: ${total}

Beats:
${itemList}

Vos fichiers sont disponibles depuis la page mes achats.`;

  return {
    to: {
      email: order.buyer.email,
      name: order.buyer.displayName,
    },
    subject: "Achat confirmé sur Universe",
    textBody,
    htmlBody: renderEmailLayout({
      preheader: "Votre achat Universe est confirmé.",
      title: "Achat confirmé",
      intro: [greeting(order.buyer.displayName), "Votre achat Universe est confirmé."],
      rows: [
        { label: "Commande", value: order.id },
        { label: "Total payé", value: total },
      ],
      listTitle: "Beats",
      listItems: order.items.map((item) => item.title),
      outro: ["Vos fichiers sont disponibles depuis la page mes achats."],
    }),
    template: "PURCHASE_CONFIRMED",
    dedupeKey: `purchase.confirmed:${order.id}`,
    recipientUserId: order.buyer.id,
    metadata: {
      orderId: order.id,
    },
  };
}

/**
 * Rend la confirmation de vente pour un vendeur.
 * @param order Commande payee.
 * @param sellerId Identifiant vendeur.
 * @param items Items de la commande associes au vendeur.
 */
export function renderSaleConfirmedEmail(
  order: OrderEmailContext,
  sellerId: string,
  items: OrderEmailContext["items"],
): TransactionalEmail | null {
  const seller = items[0]?.seller;

  if (!seller) {
    return null;
  }

  const total = formatMoney(
    items.reduce((sum, item) => sum + item.lineTotalAmount, 0),
    order.currency,
  );
  const textBody = `${greeting(seller.displayName)}

Vous avez une nouvelle vente sur Universe.

Commande: ${order.id}
Montant brut vendeur: ${total}

Beat:
${items.map((item) => `- ${item.title}`).join("\n")}

Retrouvez le détail dans votre dashboard vendeur.`;

  return {
    to: {
      email: seller.email,
      name: seller.displayName,
    },
    subject: "Nouvelle vente sur Universe",
    textBody,
    htmlBody: renderEmailLayout({
      preheader: "Vous avez une nouvelle vente sur Universe.",
      title: "Nouvelle vente",
      intro: [greeting(seller.displayName), "Vous avez une nouvelle vente sur Universe."],
      rows: [
        { label: "Commande", value: order.id },
        { label: "Montant brut vendeur", value: total },
      ],
      listTitle: "Beats",
      listItems: items.map((item) => item.title),
      outro: ["Retrouvez le detail dans votre dashboard vendeur."],
    }),
    template: "SALE_CONFIRMED",
    dedupeKey: `sale.confirmed:${order.id}:${sellerId}`,
    recipientUserId: sellerId,
    metadata: {
      orderId: order.id,
      sellerId,
      orderItemIds: items.map((item) => item.id),
    },
  };
}

/**
 * Rend le rappel de message non lu.
 * @param candidate Participant a notifier.
 * @param latestUnread Dernier message non lu eligible.
 */
export function renderChatUnreadReminderEmail(
  candidate: ChatUnreadReminderCandidate,
  latestUnread: ChatUnreadReminderMessage,
): TransactionalEmail {
  const senderName = latestUnread.sender?.profile?.displayName ?? "Un utilisateur";
  const displayName = candidate.user.profile?.displayName ?? null;
  const textBody = `${greeting(displayName)}

${senderName} vous a envoyé un message sur Universe il y a plus de 24h.

Ouvrez votre messagerie pour répondre.`;

  return {
    to: {
      email: candidate.user.email,
      name: displayName,
    },
    subject: "Message non lu sur Universe",
    textBody,
    htmlBody: renderEmailLayout({
      preheader: "Vous avez un message non lu sur Universe.",
      title: "Message non lu",
      intro: [
        greeting(displayName),
        `${senderName} vous a envoyé un message sur Universe il y a plus de 24h.`,
        "Ouvrez votre messagerie pour répondre.",
      ],
    }),
    template: "CHAT_UNREAD_REMINDER",
    dedupeKey: `chat.unread.reminder:${candidate.conversationId}:${candidate.userId}:${latestUnread.id}`,
    recipientUserId: candidate.userId,
    metadata: {
      conversationId: candidate.conversationId,
      latestUnreadMessageId: latestUnread.id,
      latestUnreadAt: latestUnread.createdAt.toISOString(),
    } satisfies Prisma.InputJsonObject,
  };
}

function formatDate(value: Date | null) {
  if (!value) {
    return "Non renseignee";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
  }).format(value);
}

export function renderSubscriptionStartedEmail(subscription: SubscriptionEmailContext): TransactionalEmail {
  const commissionRate = `${subscription.plan.reducedCommissionRateBp / 100}%`;
  const textBody = `${greeting(subscription.user.displayName)}

Votre abonnement Universe est actif.

Plan: ${subscription.plan.name}
Commission marketplace: ${commissionRate}
Prochaine échéance: ${formatDate(subscription.currentPeriodEnd)}

Vous pouvez gérer votre abonnement depuis votre profil Universe.`;

  return {
    to: {
      email: subscription.user.email,
      name: subscription.user.displayName,
    },
    subject: "Votre abonnement Universe est actif",
    textBody,
    htmlBody: renderEmailLayout({
      preheader: "Votre abonnement Universe est actif.",
      title: "Abonnement Universe actif",
      intro: [
        greeting(subscription.user.displayName),
        "Votre abonnement Universe est actif.",
        `Votre commission marketplace passe à ${commissionRate} sur toutes les ventes.`,
      ],
      rows: [
        { label: "Plan", value: subscription.plan.name },
        { label: "Commission", value: commissionRate },
        { label: "Prochaine échéance", value: formatDate(subscription.currentPeriodEnd) },
      ],
      outro: ["Vous pouvez gérer votre abonnement depuis votre profil Universe."],
    }),
    template: "SUBSCRIPTION_STARTED",
    dedupeKey: `subscription.started:${subscription.providerSubscriptionId ?? subscription.id}`,
    recipientUserId: subscription.user.id,
    metadata: {
      subscriptionId: subscription.id,
      providerSubscriptionId: subscription.providerSubscriptionId,
    } satisfies Prisma.InputJsonObject,
  };
}

export function renderSubscriptionEndedEmail(subscription: SubscriptionEmailContext): TransactionalEmail {
  const textBody = `${greeting(subscription.user.displayName)}

Votre abonnement Universe n'est plus actif.

Plan: ${subscription.plan.name}
Statut: ${subscription.status}

Votre commission marketplace repasse au taux standard sur les prochaines ventes.`;

  return {
    to: {
      email: subscription.user.email,
      name: subscription.user.displayName,
    },
    subject: "Votre abonnement Universe n'est plus actif",
    textBody,
    htmlBody: renderEmailLayout({
      preheader: "Votre abonnement Universe n'est plus actif.",
      title: "Abonnement Universe inactif",
      intro: [
        greeting(subscription.user.displayName),
        "Votre abonnement Universe n'est plus actif.",
        "Votre commission marketplace repasse au taux standard sur les prochaines ventes.",
      ],
      rows: [
        { label: "Plan", value: subscription.plan.name },
        { label: "Statut", value: subscription.status },
      ],
    }),
    template: "SUBSCRIPTION_ENDED",
    dedupeKey: `subscription.ended:${subscription.providerSubscriptionId ?? subscription.id}:${subscription.status}`,
    recipientUserId: subscription.user.id,
    metadata: {
      subscriptionId: subscription.id,
      providerSubscriptionId: subscription.providerSubscriptionId,
      status: subscription.status,
    } satisfies Prisma.InputJsonObject,
  };
}
