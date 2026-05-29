import { NextResponse } from "next/server";

import { emailService } from "@/server/email/email.service";
import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { assertCronRequestAuthorized } from "@/server/security/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Execute le cron de rappels chat non lus.
 * @param request Requete HTTP.
 */
async function handleCron(request: Request) {
  try {
    assertCronRequestAuthorized(request);

    return NextResponse.json(await emailService.sendChatUnreadReminders(), {
      status: 200,
      headers: PRIVATE_JSON_HEADERS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    const status =
      message === "cron_signature_missing" ||
      message === "cron_signature_invalid" ||
      message === "cron_timestamp_missing" ||
      message === "cron_timestamp_invalid" ||
      message === "cron_timestamp_expired" ||
      message === "cron_ip_forbidden"
        ? 401
        : message === "cron_secret_not_configured" ||
            message === "cron_allowed_ips_not_configured"
          ? 503
          : 500;

    return NextResponse.json(
      {
        error: message,
        message,
      },
      {
        status,
        headers: PRIVATE_JSON_HEADERS,
      },
    );
  }
}

/**
 * Endpoint GET utilisable par les crons HTTP simples.
 * @param request Requete cron.
 */
export async function GET(request: Request) {
  return handleCron(request);
}

/**
 * Endpoint POST utilisable par les schedulers internes.
 * @param request Requete cron.
 */
export async function POST(request: Request) {
  return handleCron(request);
}
