import { beforeEach, describe, expect, it, vi } from "vitest";

const redisEvalMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    eval: redisEvalMock,
  }),
}));

describe("rate limit helper", () => {
  beforeEach(() => {
    vi.resetModules();
    redisEvalMock.mockReset();
  });

  it("allows requests when Redis counter is under the policy limit", async () => {
    redisEvalMock.mockResolvedValue([1, 600_000]);
    const { enforceRateLimit, RATE_LIMITS } = await import("@/server/security/rate-limit");

    const response = await enforceRateLimit({
      request: new Request("https://example.com/api/test", {
        headers: { "X-Forwarded-For": "203.0.113.10" },
      }),
      policy: RATE_LIMITS.marketplaceWrite,
      userId: "user_123",
    });

    expect(response).toBeNull();
    expect(redisEvalMock).toHaveBeenCalledWith(
      expect.any(String),
      1,
      "universe:rate-limit:marketplace-write:user:user_123:ip:203.0.113.10",
      600_000,
    );
  });

  it("returns 429 with Retry-After when Redis counter exceeds the policy limit", async () => {
    redisEvalMock.mockResolvedValue([31, 30_000]);
    const { enforceRateLimit, RATE_LIMITS } = await import("@/server/security/rate-limit");

    const response = await enforceRateLimit({
      request: new Request("https://example.com/api/test"),
      policy: RATE_LIMITS.storagePresign,
    });

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBeTruthy();
    expect(await response?.json()).toMatchObject({ error: "rate_limited" });
  });

  it("fails open outside production when Redis is not configured", async () => {
    vi.stubEnv("NODE_ENV", "test");
    redisEvalMock.mockRejectedValue(new Error("redis_not_configured"));
    const { enforceRateLimit, RATE_LIMITS } = await import("@/server/security/rate-limit");

    await expect(
      enforceRateLimit({
        request: new Request("https://example.com/api/test"),
        policy: RATE_LIMITS.apiGlobal,
      }),
    ).resolves.toBeNull();
  });

  it("fails closed in production when Redis is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    redisEvalMock.mockRejectedValue(new Error("redis_not_configured"));
    const { enforceRateLimit, RATE_LIMITS } = await import("@/server/security/rate-limit");

    const response = await enforceRateLimit({
      request: new Request("https://example.com/api/test"),
      policy: RATE_LIMITS.apiGlobal,
    });

    expect(response?.status).toBe(503);
    expect(await response?.json()).toMatchObject({ error: "rate_limit_not_configured" });
  });
});
