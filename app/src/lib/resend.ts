import "server-only";

import { Resend } from "resend";

let cachedApiKey: string | null = null;
let cachedResendClient: Resend | null = null;

export function getResendClient(apiKey: string) {
  if (cachedResendClient && cachedApiKey === apiKey) {
    return cachedResendClient;
  }

  cachedApiKey = apiKey;
  cachedResendClient = new Resend(apiKey);

  return cachedResendClient;
}
