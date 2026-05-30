import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { emailService } from "@/server/email/email.service";
import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { assertCronRequestAuthorized } from "@/server/security/cron-auth";

export const dynamic = "force-dynamic";

const CHAT_UNREAD_REMINDERS_MONITOR_SLUG = "universe-nextjs-chat-unread-reminders";
const CHAT_UNREAD_REMINDERS_MONITOR_CONFIG = {
  schedule: {
    type: "crontab" as const,
    value: "0 * * * *",
  },
  checkinMargin: 10,
  maxRuntime: 5,
  timezone: "UTC",
  failureIssueThreshold: 1,
  recoveryThreshold: 1,
};

/**
 * Execute le cron de rappels chat non lus.
 * @param request Requete HTTP.
 */
async function handleCron(request: Request) {
  try {
    assertCronRequestAuthorized(request);
    const result = await Sentry.withMonitor(
      CHAT_UNREAD_REMINDERS_MONITOR_SLUG,
      () => emailService.sendChatUnreadReminders(),
      CHAT_UNREAD_REMINDERS_MONITOR_CONFIG,
    );

    return NextResponse.json(result, {
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
