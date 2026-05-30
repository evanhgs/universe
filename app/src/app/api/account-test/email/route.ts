import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { emailService } from "@/server/email/email.service";
import {
  renderChatUnreadReminderEmail,
  renderPurchaseConfirmedEmail,
  renderSaleConfirmedEmail,
  renderSellerAccessGrantedEmail,
} from "@/server/email/email.templates";
import type { OrderEmailContext, TransactionalEmail } from "@/server/email/email.types";
import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";

type EmailTestTemplate =
  | "PURCHASE_CONFIRMED"
  | "SALE_CONFIRMED"
  | "SELLER_ACCESS_GRANTED"
  | "CHAT_UNREAD_REMINDER";

type EmailTestPayload = {
  toEmail?: unknown;
  recipientName?: unknown;
  template?: unknown;
};

const EMAIL_TEST_TEMPLATES = new Set<EmailTestTemplate>([
  "PURCHASE_CONFIRMED",
  "SALE_CONFIRMED",
  "SELLER_ACCESS_GRANTED",
  "CHAT_UNREAD_REMINDER",
]);

function emailTestEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.EMAIL_TEST_ENABLED === "true";
}

function emailDiagnostics() {
  return {
    enabled: emailTestEnabled(),
    fromEmail: process.env.RESEND_EMAIL_FROM || null,
    hasApiKey: Boolean(process.env.RESEND_API_KEY),
    nodeEnv: process.env.NODE_ENV ?? null,
  };
}

function parsePayload(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("payload_must_be_object");
  }

  const payload = value as EmailTestPayload;

  if (typeof payload.toEmail !== "string" || !payload.toEmail.includes("@")) {
    throw new Error("toEmail_must_be_valid");
  }

  if (typeof payload.template !== "string" || !EMAIL_TEST_TEMPLATES.has(payload.template as EmailTestTemplate)) {
    throw new Error("template_must_be_valid");
  }

  return {
    toEmail: payload.toEmail.trim().toLowerCase(),
    recipientName: typeof payload.recipientName === "string" ? payload.recipientName.trim() || null : null,
    template: payload.template as EmailTestTemplate,
  };
}

function sampleOrder(args: { toEmail: string; recipientName: string | null }): OrderEmailContext {
  return {
    id: `email_test_order_${Date.now()}`,
    currency: "EUR",
    totalAmount: 79,
    buyer: {
      id: "email_test_buyer",
      email: args.toEmail,
      displayName: args.recipientName,
    },
    items: [
      {
        id: "email_test_item_1",
        title: "Midnight Bounce",
        lineTotalAmount: 49,
        seller: {
          id: "email_test_seller",
          email: args.toEmail,
          displayName: args.recipientName,
        },
        beat: {
          id: "email_test_beat_1",
          slug: "midnight-bounce",
          title: "Midnight Bounce",
        },
      },
      {
        id: "email_test_item_2",
        title: "Studio Lights",
        lineTotalAmount: 30,
        seller: {
          id: "email_test_seller",
          email: args.toEmail,
          displayName: args.recipientName,
        },
        beat: {
          id: "email_test_beat_2",
          slug: "studio-lights",
          title: "Studio Lights",
        },
      },
    ],
  };
}

function renderTestEmail(args: {
  toEmail: string;
  recipientName: string | null;
  template: EmailTestTemplate;
}): TransactionalEmail {
  const order = sampleOrder(args);
  const testId = Date.now();

  if (args.template === "PURCHASE_CONFIRMED") {
    const email = {
      ...renderPurchaseConfirmedEmail(order),
      dedupeKey: `email.test.purchase.${testId}`,
    };

    return testEmailEvent(email);
  }

  if (args.template === "SALE_CONFIRMED") {
    const email = renderSaleConfirmedEmail(order, "email_test_seller", order.items);

    if (!email) {
      throw new Error("sale_template_unavailable");
    }

    return testEmailEvent({
      ...email,
      dedupeKey: `email.test.sale.${testId}`,
    });
  }

  if (args.template === "SELLER_ACCESS_GRANTED") {
    return testEmailEvent({
      ...renderSellerAccessGrantedEmail(
        {
          id: "email_test_seller",
          email: args.toEmail,
          profile: {
            displayName: args.recipientName,
          },
        },
        "email_test_clerk_user",
      ),
      dedupeKey: `email.test.seller-access.${testId}`,
    });
  }

  return testEmailEvent({
    ...renderChatUnreadReminderEmail(
      {
        conversationId: "email_test_conversation",
        userId: "email_test_recipient",
        user: {
          email: args.toEmail,
          profile: {
            displayName: args.recipientName,
          },
        },
      },
      {
        id: "email_test_message",
        createdAt: new Date(),
        sender: {
          profile: {
            displayName: "Universe Test Sender",
          },
        },
      },
    ),
    dedupeKey: `email.test.chat.${testId}`,
  });
}

function testEmailEvent(email: TransactionalEmail): TransactionalEmail {
  const metadata =
    typeof email.metadata === "object" && email.metadata !== null && !Array.isArray(email.metadata)
      ? email.metadata
      : {};

  return {
    ...email,
    recipientUserId: null,
    metadata: {
      ...metadata,
      emailTest: true,
    },
  };
}

/**
 * Retourne l'etat de configuration email sans exposer la cle API Resend.
 */
export async function GET() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  return NextResponse.json(emailDiagnostics(), {
    status: 200,
    headers: PRIVATE_JSON_HEADERS,
  });
}

/**
 * Envoie un email transactionnel de test depuis la page account-test.
 * @param request Requete JSON contenant toEmail, recipientName et template.
 */
export async function POST(request: Request) {
  if (!emailTestEnabled()) {
    return NextResponse.json(
      { error: "email_test_disabled" },
      { status: 404, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  try {
    const payload = parsePayload(await request.json());
    const email = renderTestEmail(payload);
    const event = await emailService.send(email);
    const accepted = event.status === "SENT";

    return NextResponse.json(
      {
        accepted,
        diagnostics: emailDiagnostics(),
        event,
        template: email.template,
        toEmail: email.to.email,
      },
      { status: accepted ? 200 : 502, headers: PRIVATE_JSON_HEADERS },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "email_test_failed",
        message: error instanceof Error ? error.message : "Unknown error.",
      },
      { status: 400, headers: PRIVATE_JSON_HEADERS },
    );
  }
}
