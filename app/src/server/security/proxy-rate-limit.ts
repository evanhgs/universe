import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse, type NextRequest } from "next/server";

type ProxyRateLimitPolicy = {
  limit: number;
  window: `${number} ${"s" | "m" | "h" | "d"}`;
  prefix: string;
};

const API_GLOBAL_POLICY = {
  limit: 300,
  window: "1 m",
  prefix: "api-global",
} as const satisfies ProxyRateLimitPolicy;

const limiters = new Map<string, Ratelimit>();

function readUpstashEnv() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  return url && token ? { url, token } : null;
}

function getLimiter(policy: ProxyRateLimitPolicy, env: { url: string; token: string }) {
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

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();

  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    firstForwardedIp ||
    "unknown"
  );
}

function rateLimitUnavailableResponse() {
  return NextResponse.json(
    {
      error: "rate_limit_not_configured",
      message: "rate_limit_not_configured",
    },
    { status: 503 },
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
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

export async function enforceGlobalApiRateLimit(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return null;
  }

  const env = readUpstashEnv();

  if (!env) {
    return process.env.NODE_ENV === "production" ? rateLimitUnavailableResponse() : null;
  }

  const result = await getLimiter(API_GLOBAL_POLICY, env).limit(`ip:${getClientIp(request)}`);

  return result.success ? null : rateLimitedResponse(result.reset);
}
