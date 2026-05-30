import { auth } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";

function sentryTestEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.SENTRY_TEST_ENABLED === "true";
}

function isValidSentryDsn(value: string | undefined) {
  const dsn = value?.trim();

  if (!dsn) {
    return false;
  }

  try {
    const url = new URL(dsn);

    return url.protocol.startsWith("http") && Boolean(url.username) && url.pathname.length > 1;
  } catch {
    return false;
  }
}

function sentryDiagnostics() {
  const serverDsn = process.env.SENTRY_DSN?.trim() || undefined;
  const publicDsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined;
  const configuredDsn = serverDsn ?? publicDsn;

  return {
    configured: Boolean(configuredDsn),
    dsnSource: serverDsn ? "SENTRY_DSN" : publicDsn ? "NEXT_PUBLIC_SENTRY_DSN" : null,
    dsnLooksValid: isValidSentryDsn(configuredDsn),
    enabled: Sentry.isEnabled(),
    environment: process.env.SENTRY_ENVIRONMENT || process.env.APP_ENV || null,
    authTokenRequiredForEvents: false,
  };
}

export async function POST() {
  if (!sentryTestEnabled()) {
    return NextResponse.json(
      { error: "sentry_test_disabled" },
      { status: 404, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_JSON_HEADERS },
    );
  }

  const error = new Error("Sentry account-test trigger");
  const eventId = Sentry.withScope((scope) => {
    scope.setTag("test_surface", "account-test");
    scope.setTag("test_kind", "manual_sentry_trigger");
    scope.setUser({ id: userId });

    return Sentry.captureException(error);
  });

  await Sentry.flush(2000);

  return NextResponse.json(
    {
      error: "sentry_test_error",
      eventId,
      message: error.message,
      sentry: sentryDiagnostics(),
    },
    { status: 500, headers: PRIVATE_JSON_HEADERS },
  );
}
