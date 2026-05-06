import { NextResponse } from "next/server";

import { emailService } from "@/server/email/email.service";
import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";

export const dynamic = "force-dynamic";

/**
 * Verifie le secret cron self-host.
 * @param request Requete cron.
 */
function assertCronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    throw new Error("cron_secret_not_configured");
  }

  const authorization = request.headers.get("authorization");

  if (authorization !== `Bearer ${secret}`) {
    throw new Error("unauthorized");
  }
}

/**
 * Execute le cron de rappels chat non lus.
 * @param request Requete HTTP.
 */
async function handleCron(request: Request) {
  try {
    assertCronAuthorized(request);

    return NextResponse.json(await emailService.sendChatUnreadReminders(), {
      status: 200,
      headers: PRIVATE_JSON_HEADERS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    const status =
      message === "unauthorized"
        ? 401
        : message === "cron_secret_not_configured"
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
