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

export default clerkMiddleware({
  authorizedParties: authorizedParties.length > 0 ? authorizedParties : undefined,
  contentSecurityPolicy: {
    strict: true,
    directives: {
      ...(connectSrc.length > 0 ? { "connect-src": connectSrc } : {}),
    },
  },
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
