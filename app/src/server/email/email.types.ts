import "server-only";

import type { EmailProvider, EmailTemplate } from "../../../generated/prisma/enums";
import type { Prisma } from "../../../generated/prisma/client";

export type EmailAddress = {
  email: string;
  name?: string | null;
};

export type TransactionalEmail = {
  to: EmailAddress;
  subject: string;
  textBody: string;
  htmlBody: string;
  template: EmailTemplate;
  dedupeKey?: string;
  recipientUserId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export type EmailProviderSendInput = {
  fromEmail: string;
  toEmail: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  template: EmailTemplate;
  metadata?: Prisma.InputJsonValue;
};

export type EmailProviderSendResult = {
  provider: EmailProvider;
  providerMessageId: string | null;
};

export type EmailProviderClient = {
  send(input: EmailProviderSendInput): Promise<EmailProviderSendResult>;
};

export type OrderEmailContext = {
  id: string;
  currency: string;
  totalAmount: number;
  buyer: {
    id: string;
    email: string;
    displayName: string | null;
  };
  items: Array<{
    id: string;
    title: string;
    lineTotalAmount: number;
    seller: {
      id: string;
      email: string;
      displayName: string | null;
    } | null;
    beat: {
      id: string;
      slug: string;
      title: string;
    } | null;
  }>;
};

export type ChatUnreadReminderContext = {
  conversationId: string;
  latestUnreadMessageId: string;
  latestUnreadAt: Date;
  recipient: {
    id: string;
    email: string;
    displayName: string | null;
  };
  sender: {
    id: string;
    displayName: string | null;
  } | null;
};
