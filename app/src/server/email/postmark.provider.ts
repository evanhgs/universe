import "server-only";

import type {
  EmailProviderClient,
  EmailProviderSendInput,
  EmailProviderSendResult,
} from "./email.types";

type PostmarkResponse = {
  ErrorCode?: number;
  Message?: string;
  MessageID?: string;
};

/**
 * Convertit les metadata internes en paires Postmark simples.
 * @param value Metadata JSON metier.
 */
function postmarkMetadata(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === "string" ? item : JSON.stringify(item),
    ]),
  );
}

/**
 * Provider Postmark REST. Isole l'API externe du metier pour pouvoir remplacer par SES.
 */
export class PostmarkEmailProvider implements EmailProviderClient {
  /**
   * Envoie un email transactionnel via Postmark.
   * @param input Email rendu par EmailService.
   */
  async send(input: EmailProviderSendInput): Promise<EmailProviderSendResult> {
    const token = process.env.POSTMARK_SERVER_TOKEN;

    if (!token) {
      throw new Error("postmark_server_token_missing");
    }

    const response = await fetch("https://api.postmarkapp.com/email", {
      body: JSON.stringify({
        From: input.fromEmail,
        To: input.toEmail,
        Subject: input.subject,
        TextBody: input.textBody,
        HtmlBody: input.htmlBody,
        Tag: input.template.toLowerCase().replaceAll("_", "."),
        Metadata: postmarkMetadata(input.metadata),
        MessageStream: "outbound",
      }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": token,
      },
      method: "POST",
    });
    const body = (await response.json().catch(() => ({}))) as PostmarkResponse;

    if (!response.ok || body.ErrorCode !== 0) {
      throw new Error(body.Message ?? `postmark_error:${response.status}`);
    }

    return {
      provider: "POSTMARK",
      providerMessageId: body.MessageID ?? null,
    };
  }
}
