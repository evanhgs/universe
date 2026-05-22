import { beforeEach, describe, expect, it, vi } from "vitest";

const limitMock = vi.hoisted(() => vi.fn());
const redisConstructorMock = vi.hoisted(() => vi.fn());

vi.mock("@upstash/redis", () => ({
  Redis: redisConstructorMock,
}));

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow = vi.fn((limit: number, window: string) => ({ limit, window }));

    limit = limitMock;
  }

  return { Ratelimit };
});

describe("rate limit helper", () => {
  beforeEach(() => {
    vi.resetModules();
    limitMock.mockReset();
    redisConstructorMock.mockReset();
  });

  it("allows requests when Upstash accepts the identifier", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    limitMock.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });
    const { enforceRateLimit, RATE_LIMITS } = await import("@/server/security/rate-limit");

    const response = await enforceRateLimit({
      request: new Request("https://example.com/api/test", {
        headers: { "X-Forwarded-For": "203.0.113.10" },
      }),
      policy: RATE_LIMITS.marketplaceWrite,
      userId: "user_123",
    });

    expect(response).toBeNull();
    expect(limitMock).toHaveBeenCalledWith("user:user_123:ip:203.0.113.10");
  });

  it("returns 429 with Retry-After when Upstash blocks the request", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    limitMock.mockResolvedValue({ success: false, reset: Date.now() + 30_000 });
    const { enforceRateLimit, RATE_LIMITS } = await import("@/server/security/rate-limit");

    const response = await enforceRateLimit({
      request: new Request("https://example.com/api/test"),
      policy: RATE_LIMITS.storagePresign,
    });

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBeTruthy();
    expect(await response?.json()).toMatchObject({ error: "rate_limited" });
  });

  it("fails open outside production when Upstash env is missing", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { enforceRateLimit, RATE_LIMITS } = await import("@/server/security/rate-limit");

    await expect(
      enforceRateLimit({
        request: new Request("https://example.com/api/test"),
        policy: RATE_LIMITS.apiGlobal,
      }),
    ).resolves.toBeNull();
  });

  it("fails closed in production when Upstash env is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { enforceRateLimit, RATE_LIMITS } = await import("@/server/security/rate-limit");

    const response = await enforceRateLimit({
      request: new Request("https://example.com/api/test"),
      policy: RATE_LIMITS.apiGlobal,
    });

    expect(response?.status).toBe(503);
    expect(await response?.json()).toMatchObject({ error: "rate_limit_not_configured" });
  });
});
