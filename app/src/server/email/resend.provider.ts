import "server-only";

import { getResendClient } from "@/lib/resend";

import type {
  CreateEmailOptions,
  CreateEmailRequestOptions,
  CreateEmailResponse,
} from "resend";
import type {
  EmailProviderClient,
  EmailProviderSendInput,
  EmailProviderSendResult,
} from "./email.types";

type ResendEmailClient = {
  emails: {
    send(
      payload: CreateEmailOptions,
      options?: CreateEmailRequestOptions,
    ): Promise<CreateEmailResponse>;
  };
};

type ResendClientFactory = (apiKey: string) => ResendEmailClient;

function templateTag(value: string) {
  return value.toLowerCase().replaceAll("_", "-");
}

function normalizeResendError(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      message?: unknown;
      name?: unknown;
      statusCode?: unknown;
    };
    const message = typeof maybeError.message === "string" ? maybeError.message : "Unknown error.";
    const name = typeof maybeError.name === "string" ? maybeError.name : "unknown";
    const statusCode = typeof maybeError.statusCode === "number" ? maybeError.statusCode : "unknown";

    return `resend_error:${statusCode}:${name}:${message}`;
  }

  return "Unknown Resend error.";
}

export class ResendEmailProvider implements EmailProviderClient {
  constructor(private readonly createClient: ResendClientFactory = getResendClient) {}

  async send(input: EmailProviderSendInput): Promise<EmailProviderSendResult> {
    const apiKey = process.env.RESEND_API_KEY?.trim();

    if (!apiKey) {
      throw new Error("resend_api_key_missing");
    }

    const payload: CreateEmailOptions = {
      from: input.fromEmail,
      to: [input.toEmail],
      subject: input.subject,
      text: input.textBody,
      html: input.htmlBody,
      tags: [
        {
          name: "category",
          value: templateTag(input.template),
        },
      ],
    };

    const options = input.dedupeKey
      ? {
          idempotencyKey: input.dedupeKey.slice(0, 256),
        }
      : undefined;

    const { data, error } = await this.createClient(apiKey).emails.send(payload, options);

    if (error) {
      throw new Error(normalizeResendError(error));
    }

    return {
      provider: "RESEND",
      providerMessageId: data?.id ?? null,
    };
  }
}
