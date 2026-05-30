import * as Sentry from "@sentry/nextjs";

function nonEmptyEnv(name: string) {
  return process.env[name]?.trim() || undefined;
}

function sentryDsn(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);

    return url.protocol.startsWith("http") && Boolean(url.username) && url.pathname.length > 1
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

export async function register() {
  const dsn = sentryDsn(nonEmptyEnv("SENTRY_DSN")) ?? sentryDsn(nonEmptyEnv("NEXT_PUBLIC_SENTRY_DSN"));

  Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    environment: nonEmptyEnv("SENTRY_ENVIRONMENT") ?? nonEmptyEnv("APP_ENV"),
    release: nonEmptyEnv("SENTRY_RELEASE"),
  });
}

export const onRequestError = Sentry.captureRequestError;
