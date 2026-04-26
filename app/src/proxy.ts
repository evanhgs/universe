import { clerkMiddleware } from "@clerk/nextjs/server";

const splitEnvList = (value: string | undefined) =>
  value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

const appUrl = process.env.APP_URL;
const apiUrl = process.env.AI_SERVICES_URL;
const authorizedParties = Array.from(
  new Set([
    ...splitEnvList(process.env.CLERK_AUTHORIZED_PARTIES),
    ...(appUrl ? [appUrl] : []),
  ]),
);

const connectSrc = Array.from(
  new Set([
    ...(apiUrl ? [apiUrl] : []),
    ...(process.env.NODE_ENV !== "production" ? ["ws:", "wss:"] : []),
  ]),
);

const proxy = clerkMiddleware({
  authorizedParties: authorizedParties.length > 0 ? authorizedParties : undefined,
  contentSecurityPolicy: {
    strict: true,
    directives: {
      ...(connectSrc.length > 0 ? { "connect-src": connectSrc } : {}),
    },
  },
});

export default proxy;

export const config = {
  matcher: [
    // Clerk must also run for 404s from broken public/media asset URLs because
    // the root layout renders Clerk auth controls for those error responses.
    "/((?!_next).*)",
  ],
};
