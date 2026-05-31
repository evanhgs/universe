import * as Sentry from "@sentry/nextjs";

function sentryDsn(value: string | undefined) {
  const dsn = value?.trim();

  if (!dsn) {
    return undefined;
  }

  try {
    const url = new URL(dsn);

    return url.protocol.startsWith("http") && Boolean(url.username) && url.pathname.length > 1
      ? dsn
      : undefined;
  } catch {
    return undefined;
  }
}

const dsn = sentryDsn(process.env.NEXT_PUBLIC_SENTRY_DSN);

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT?.trim() || undefined,
  release: process.env.SENTRY_RELEASE?.trim() || undefined,
});
