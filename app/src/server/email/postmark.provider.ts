import "server-only";

import { ServerClient } from "postmark";
import type { Message } from "postmark";

import type {
  EmailProviderClient,
  EmailProviderSendInput,
  EmailProviderSendResult,
} from "./email.types";

type PostmarkClient = Pick<ServerClient, "sendEmail">;
type PostmarkClientFactory = (serverToken: string) => PostmarkClient;

let cachedServerToken: string | null = null;
let cachedPostmarkClient: ServerClient | null = null;

function getPostmarkClient(serverToken: string) {
  if (cachedPostmarkClient && cachedServerToken === serverToken) {
    return cachedPostmarkClient;
  }

  cachedServerToken = serverToken;
  cachedPostmarkClient = new ServerClient(serverToken);

  return cachedPostmarkClient;
}

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
 * Normalise les erreurs Postmark sans exposer de secret applicatif.
 * @param error Erreur remontee par le client Postmark.
 */
function providerErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "number" ? error.code : null;
    const statusCode =
      "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : null;

    if (code || statusCode) {
      return `postmark_error:${statusCode ?? "unknown"}:${code ?? "unknown"}:${error.message}`;
    }

    return error.message;
  }

  return "Unknown Postmark error.";
}

/**
 * Provider Postmark officiel. Isole l'API externe du metier pour pouvoir remplacer par SES.
 */
export class PostmarkEmailProvider implements EmailProviderClient {
  constructor(private readonly createClient: PostmarkClientFactory = getPostmarkClient) {}

  /**
   * Envoie un email transactionnel via Postmark.
   * @param input Email rendu par EmailService.
   */
  async send(input: EmailProviderSendInput): Promise<EmailProviderSendResult> {
    const token = process.env.POSTMARK_SERVER_TOKEN;

    if (!token) {
      throw new Error("postmark_server_token_missing");
    }

    const email: Message = {
      From: input.fromEmail,
      To: input.toEmail,
      Subject: input.subject,
      TextBody: input.textBody,
      HtmlBody: input.htmlBody,
      Tag: input.template.toLowerCase().replaceAll("_", "."),
      Metadata: postmarkMetadata(input.metadata),
      MessageStream: process.env.POSTMARK_MESSAGE_STREAM || "outbound",
    };

    try {
      const response = await this.createClient(token).sendEmail(email);

      return {
        provider: "POSTMARK",
        providerMessageId: response.MessageID ?? null,
      };
    } catch (error) {
      throw new Error(providerErrorMessage(error));
    }
  }
}
