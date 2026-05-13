import "server-only";

import { Prisma } from "../../../generated/prisma/client";
import type { OrderEmailContext, TransactionalEmail } from "./email.types";

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
        `<p style="margin:0 0 16px;color:#333333;font-size:16px;line-height:1.6;">${escapeHtml(
          value,
        )}</p>`,
    )
    .join("");
}

function renderRows(rows: LayoutRow[] | undefined) {
  if (!rows?.length) {
    return "";
  }

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 24px;border-collapse:collapse;border:1px solid #e6e2dc;">
${rows
  .map(
    (row) => `<tr>
  <td style="padding:12px 14px;background:#f8f6f2;border-bottom:1px solid #e6e2dc;color:#6f6a62;font-size:13px;font-weight:700;text-transform:uppercase;">${escapeHtml(
    row.label,
  )}</td>
  <td style="padding:12px 14px;border-bottom:1px solid #e6e2dc;color:#111111;font-size:15px;text-align:right;">${escapeHtml(
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

  return `<div style="margin:0 0 24px;">
  <p style="margin:0 0 10px;color:#111111;font-size:15px;font-weight:700;">${escapeHtml(
    title,
  )}</p>
  <ul style="margin:0;padding:0 0 0 20px;color:#333333;font-size:15px;line-height:1.6;">
${items.map((item) => `    <li>${escapeHtml(item)}</li>`).join("\n")}
  </ul>
</div>`;
}

function renderEmailLayout(input: EmailLayoutInput) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f0ea;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(
      input.preheader,
    )}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f3f0ea;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e2ddd4;border-collapse:collapse;">
            <tr>
              <td style="padding:24px 28px 18px;border-bottom:1px solid #e2ddd4;">
                <div style="color:#111111;font-size:18px;font-weight:800;letter-spacing:0;">Universe</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0 0 18px;color:#111111;font-size:24px;line-height:1.25;font-weight:800;">${escapeHtml(
                  input.title,
                )}</h1>
                ${renderParagraphs(input.intro)}
                ${renderRows(input.rows)}
                ${renderList(input.listTitle, input.listItems)}
                ${renderParagraphs(input.outro ?? [])}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#111111;color:#f7f3ec;font-size:12px;line-height:1.5;">
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

Ton achat Universe est confirme.

Commande: ${order.id}
Total paye: ${total}

Instrumentales:
${itemList}

Tes fichiers sont disponibles depuis Mes achats.`;

  return {
    to: {
      email: order.buyer.email,
      name: order.buyer.displayName,
    },
    subject: "Achat confirme sur Universe",
    textBody,
    htmlBody: renderEmailLayout({
      preheader: "Ton achat Universe est confirme.",
      title: "Achat confirme",
      intro: [greeting(order.buyer.displayName), "Ton achat Universe est confirme."],
      rows: [
        { label: "Commande", value: order.id },
        { label: "Total paye", value: total },
      ],
      listTitle: "Instrumentales",
      listItems: order.items.map((item) => item.title),
      outro: ["Tes fichiers sont disponibles depuis Mes achats."],
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

Tu as une nouvelle vente sur Universe.

Commande: ${order.id}
Montant brut vendeur: ${total}

Instrumentales:
${items.map((item) => `- ${item.title}`).join("\n")}

Retrouve le detail dans ton dashboard vendeur.`;

  return {
    to: {
      email: seller.email,
      name: seller.displayName,
    },
    subject: "Nouvelle vente sur Universe",
    textBody,
    htmlBody: renderEmailLayout({
      preheader: "Tu as une nouvelle vente sur Universe.",
      title: "Nouvelle vente",
      intro: [greeting(seller.displayName), "Tu as une nouvelle vente sur Universe."],
      rows: [
        { label: "Commande", value: order.id },
        { label: "Montant brut vendeur", value: total },
      ],
      listTitle: "Instrumentales",
      listItems: items.map((item) => item.title),
      outro: ["Retrouve le detail dans ton dashboard vendeur."],
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
 * Rend la confirmation d'acces vendeur.
 * @param account Compte vendeur.
 * @param clerkUserId Identifiant Clerk.
 */
export function renderSellerAccessGrantedEmail(
  account: SellerAccessGrantedAccount,
  clerkUserId: string,
): TransactionalEmail {
  const displayName = account.profile?.displayName ?? null;
  const textBody = `${greeting(displayName)}

Ton acces vendeur Universe est active.

Tu peux publier tes instrumentales, suivre tes ventes et gerer ton catalogue depuis ton compte.`;

  return {
    to: {
      email: account.email,
      name: displayName,
    },
    subject: "Ton acces vendeur Universe est active",
    textBody,
    htmlBody: renderEmailLayout({
      preheader: "Ton acces vendeur Universe est active.",
      title: "Acces vendeur active",
      intro: [
        greeting(displayName),
        "Ton acces vendeur Universe est active.",
        "Tu peux publier tes instrumentales, suivre tes ventes et gerer ton catalogue depuis ton compte.",
      ],
    }),
    template: "SELLER_ACCESS_GRANTED",
    dedupeKey: `seller.access.granted:${account.id}`,
    recipientUserId: account.id,
    metadata: {
      clerkUserId,
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

${senderName} t'a envoye un message sur Universe il y a plus de 24h.

Ouvre ta messagerie pour repondre.`;

  return {
    to: {
      email: candidate.user.email,
      name: displayName,
    },
    subject: "Message non lu sur Universe",
    textBody,
    htmlBody: renderEmailLayout({
      preheader: "Tu as un message non lu sur Universe.",
      title: "Message non lu",
      intro: [
        greeting(displayName),
        `${senderName} t'a envoye un message sur Universe il y a plus de 24h.`,
        "Ouvre ta messagerie pour repondre.",
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
