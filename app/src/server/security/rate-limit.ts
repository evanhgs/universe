import { NextResponse } from "next/server";

import { API_PATHS } from "@/lib/paths";
import { getRedis } from "@/lib/redis";

export type RateLimitPolicy = {
  limit: number;
  window: `${number} ${"s" | "m" | "h" | "d"}`;
  prefix: string;
};

type RateLimitResult =
  | { status: "allowed" }
  | { status: "blocked"; retryAfterMs: number }
  | { status: "unavailable" };

type EnforceRateLimitArgs = {
  request: Request;
  policy: RateLimitPolicy;
  userId?: string | null;
};

const PRIVATE_JSON_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
} as const;

function rateLimitNumber(name: string, fallback: number) {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const RATE_LIMITS = {
  apiGlobal: { limit: rateLimitNumber("REDIS_API_GLOBAL", 300), window: "1 m", prefix: "api-global" },
  accountWrite: {
    limit: rateLimitNumber("REDIS_ACCOUNT_WRITE", 20),
    window: "10 m",
    prefix: "account-write",
  },
  storagePresign: {
    limit: rateLimitNumber("REDIS_STORAGE_PRESIGN", 30),
    window: "10 m",
    prefix: "storage-presign",
  },
  marketplaceWrite: {
    limit: rateLimitNumber("REDIS_MARKETPLACE_WRITE", 30),
    window: "10 m",
    prefix: "marketplace-write",
  },
  marketplaceRead: {
    limit: rateLimitNumber("REDIS_MARKETPLACE_READ", 120),
    window: "10 m",
    prefix: "marketplace-read",
  },
  analyticsWrite: {
    limit: rateLimitNumber("REDIS_ANALYTICS_WRITE", 240),
    window: "1 m",
    prefix: "analytics-write",
  },
  chatWrite: { limit: rateLimitNumber("REDIS_CHAT_WRITE", 60), window: "1 m", prefix: "chat-write" },
  chatRead: { limit: rateLimitNumber("REDIS_CHAT_READ", 180), window: "1 m", prefix: "chat-read" },
  publicEnumeration: {
    limit: rateLimitNumber("REDIS_PUBLIC_ENUMERATION", 120),
    window: "1 m",
    prefix: "public-enumeration",
  },
  accountTestBurst: {
    limit: rateLimitNumber("REDIS_ACCOUNT_TEST_BURST", 8),
    window: "10 s",
    prefix: "account-test-burst",
  },
} as const satisfies Record<string, RateLimitPolicy>;

const RATE_LIMIT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { current, ttl }
`;

function shouldFailClosedWhenMissingConfig() {
  return process.env.NODE_ENV === "production";
}

function parseWindowMs(window: RateLimitPolicy["window"]) {
  const [amountRaw, unit] = window.split(" ") as [string, "s" | "m" | "h" | "d"];
  const amount = Number(amountRaw);

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("rate_limit_window_invalid");
  }

  switch (unit) {
    case "s":
      return amount * 1000;
    case "m":
      return amount * 60 * 1000;
    case "h":
      return amount * 60 * 60 * 1000;
    case "d":
      return amount * 24 * 60 * 60 * 1000;
  }
}

function rateLimitKey(policy: RateLimitPolicy, identifier: string) {
  return `universe:rate-limit:${policy.prefix}:${identifier}`;
}

function normalizeRedisEvalResult(result: unknown): { count: number; ttlMs: number } {
  if (!Array.isArray(result) || result.length !== 2) {
    throw new Error("rate_limit_redis_result_invalid");
  }

  const [count, ttlMs] = result.map(Number);

  if (!Number.isFinite(count) || !Number.isFinite(ttlMs)) {
    throw new Error("rate_limit_redis_result_invalid");
  }

  return { count, ttlMs };
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

async function checkRateLimit(
  policy: RateLimitPolicy,
  identifier: string,
): Promise<RateLimitResult> {
  try {
    const result = await getRedis().eval(
      RATE_LIMIT_SCRIPT,
      1,
      rateLimitKey(policy, identifier),
      parseWindowMs(policy.window),
    );
    const { count, ttlMs } = normalizeRedisEvalResult(result);

    if (count <= policy.limit) {
      return { status: "allowed" };
    }

    return { status: "blocked", retryAfterMs: ttlMs };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "redis_not_configured" &&
      !shouldFailClosedWhenMissingConfig()
    ) {
      return { status: "allowed" };
    }

    return shouldFailClosedWhenMissingConfig() ? { status: "unavailable" } : { status: "allowed" };
  }
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

function rateLimitedResponse(retryAfterMs: number) {
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));

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

function enforceResult(result: RateLimitResult) {
  switch (result.status) {
    case "allowed":
      return null;
    case "blocked":
      return rateLimitedResponse(result.retryAfterMs);
    case "unavailable":
      return rateLimitUnavailableResponse();
  }
}

export async function enforceRateLimit({
  request,
  policy,
  userId,
}: EnforceRateLimitArgs): Promise<Response | null> {
  const ip = getClientIp(request);
  const identifier = userId ? `user:${userId}:ip:${ip}` : `ip:${ip}`;
  const result = await checkRateLimit(policy, identifier);

  return enforceResult(result);
}

export async function enforceGlobalApiRateLimit(request: Request): Promise<Response | null> {
  if (!new URL(request.url).pathname.startsWith(API_PATHS.root.path)) {
    return null;
  }

  const result = await checkRateLimit(RATE_LIMITS.apiGlobal, `ip:${getClientIp(request)}`);

  return enforceResult(result);
}
