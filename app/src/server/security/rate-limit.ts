import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";

type RateLimitPolicy = {
  limit: number;
  window: `${number} ${"s" | "m" | "h" | "d"}`;
  prefix: string;
};

type EnforceRateLimitArgs = {
  request: Request;
  policy: RateLimitPolicy;
  userId?: string | null;
};

type UpstashEnv = {
  url: string;
  token: string;
};

export const RATE_LIMITS = {
  apiGlobal: { limit: 300, window: "1 m", prefix: "api-global" },
  accountWrite: { limit: 20, window: "10 m", prefix: "account-write" },
  storagePresign: { limit: 30, window: "10 m", prefix: "storage-presign" },
  marketplaceWrite: { limit: 30, window: "10 m", prefix: "marketplace-write" },
  marketplaceRead: { limit: 120, window: "10 m", prefix: "marketplace-read" },
  chatWrite: { limit: 60, window: "1 m", prefix: "chat-write" },
  chatRead: { limit: 180, window: "1 m", prefix: "chat-read" },
  publicEnumeration: { limit: 120, window: "1 m", prefix: "public-enumeration" },
} as const satisfies Record<string, RateLimitPolicy>;

const limiters = new Map<string, Ratelimit>();

function readUpstashEnv(): UpstashEnv | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    return null;
  }

  return { url, token };
}

function shouldFailClosedWhenMissingConfig() {
  return process.env.NODE_ENV === "production";
}

function rateLimitUnavailableResponse() {
  return NextResponse.json(
    {
      error: "rate_limit_not_configured",
      message: "rate_limit_not_configured",
    },
    { status: 503, headers: PRIVATE_JSON_HEADERS },
  );
}

function rateLimitedResponse(reset: number) {
  const retryAfterSeconds = Math.max(1, Math.ceil((reset - Date.now()) / 1000));

  return NextResponse.json(
    {
      error: "rate_limited",
      message: "Too many requests.",
    },
    {
      status: 429,
      headers: {
        ...PRIVATE_JSON_HEADERS,
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

function getLimiter(policy: RateLimitPolicy, env: UpstashEnv) {
  const key = `${policy.prefix}:${policy.limit}:${policy.window}:${env.url}`;
  const existing = limiters.get(key);

  if (existing) {
    return existing;
  }

  const limiter = new Ratelimit({
    redis: new Redis({
      url: env.url,
      token: env.token,
    }),
    limiter: Ratelimit.slidingWindow(policy.limit, policy.window),
    prefix: `universe:${policy.prefix}`,
    analytics: false,
  });

  limiters.set(key, limiter);
  return limiter;
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();

  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    firstForwardedIp ||
    "unknown"
  );
}

export async function enforceRateLimit({
  request,
  policy,
  userId,
}: EnforceRateLimitArgs): Promise<Response | null> {
  const env = readUpstashEnv();

  if (!env) {
    return shouldFailClosedWhenMissingConfig() ? rateLimitUnavailableResponse() : null;
  }

  const ip = getClientIp(request);
  const identifier = userId ? `user:${userId}:ip:${ip}` : `ip:${ip}`;
  const result = await getLimiter(policy, env).limit(identifier);

  if (result.success) {
    return null;
  }

  return rateLimitedResponse(result.reset);
}
