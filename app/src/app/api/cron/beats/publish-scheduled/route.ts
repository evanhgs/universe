import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { publishScheduledBeatsDue } from "@/server/beats/beat.service";
import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import { assertCronRequestAuthorized } from "@/server/security/cron-auth";

export const dynamic = "force-dynamic";

const PUBLISH_SCHEDULED_BEATS_MONITOR_SLUG = "universe-nextjs-publish-scheduled-beats";
const PUBLISH_SCHEDULED_BEATS_MONITOR_CONFIG = {
  schedule: {
    type: "crontab" as const,
    value: "*/5 * * * *",
  },
  checkinMargin: 5,
  maxRuntime: 5,
  timezone: "UTC",
  failureIssueThreshold: 1,
  recoveryThreshold: 1,
};

/**
 * Execute le cron de publication des beats programmes dont la date est echue.
 * @param request Requete HTTP cron, authentifiee par signature HMAC.
 */
async function handleCron(request: Request) {
  try {
    assertCronRequestAuthorized(request);
    const result = await Sentry.withMonitor(
      PUBLISH_SCHEDULED_BEATS_MONITOR_SLUG,
      () => publishScheduledBeatsDue(),
      PUBLISH_SCHEDULED_BEATS_MONITOR_CONFIG,
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
