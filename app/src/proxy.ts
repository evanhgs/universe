import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Decoupe une variable d'environnement listee par virgules.
 * @param value Valeur brute optionnelle.
 * @returns Elements trimmes non vides.
 */
const splitEnvList = (value: string | undefined) =>
  value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

const normalizeOrigin = (value: string) => {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, "");
  }
};

const normalizeOriginList = (values: string[]) => values.map(normalizeOrigin);

const appUrl = process.env.APP_URL;
const apiUrl = process.env.AI_SERVICES_URL;
const s3PublicEndpoint = process.env.S3_PUBLIC_ENDPOINT;
const authorizedParties = Array.from(
  new Set([
    ...normalizeOriginList(splitEnvList(process.env.CLERK_AUTHORIZED_PARTIES)),
    ...(appUrl ? [normalizeOrigin(appUrl)] : []),
  ]),
);

const connectSrc = Array.from(
  new Set([
    ...(apiUrl ? [apiUrl] : []),
    ...(s3PublicEndpoint ? [s3PublicEndpoint] : []),
    ...(process.env.NODE_ENV !== "production" ? ["ws:", "wss:"] : []),
  ]),
);
const storageAssetSrc = s3PublicEndpoint ? [s3PublicEndpoint] : [];

export const proxy = clerkMiddleware({
  authorizedParties: authorizedParties.length > 0 ? authorizedParties : undefined,
  contentSecurityPolicy: {
    strict: true,
    directives: {
      ...(connectSrc.length > 0 ? { "connect-src": connectSrc } : {}),
      ...(storageAssetSrc.length > 0 ? { "img-src": storageAssetSrc } : {}),
      ...(storageAssetSrc.length > 0 ? { "media-src": storageAssetSrc } : {}),
    },
  },
});

export default proxy;

export const config = {
  matcher: [
    // Clerk must also run for 404s from broken public/media asset URLs because
    // the root layout renders Clerk auth controls for those error responses.
    "/((?!_next|__nextjs).*)",
  ],
};
