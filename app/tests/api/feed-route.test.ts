import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const findUniqueMock = vi.fn();
const listRecommendedFeedPagePayloadMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    user: {
      findUnique: findUniqueMock,
    },
  }),
}));

vi.mock("@/server/analytics/analytics.service", () => ({
  listRecommendedFeedPagePayload: listRecommendedFeedPagePayloadMock,
  parseRecommendedFeedQuery: (url: URL) => {
    const cursorRaw = url.searchParams.get("cursor");
    const limit = Number(url.searchParams.get("limit") ?? 10);

    if (!cursorRaw) {
      return {
        limit,
        sessionId: url.searchParams.get("sessionId") ?? undefined,
      };
    }

    try {
      const cursor = JSON.parse(Buffer.from(cursorRaw, "base64url").toString("utf8"));

      if (typeof cursor.seed !== "number" || typeof cursor.offset !== "number") {
        throw new Error("feed_cursor_invalid");
      }

      return {
        limit,
        cursor,
        sessionId: url.searchParams.get("sessionId") ?? undefined,
      };
    } catch {
      throw new Error("feed_cursor_invalid");
    }
  },
}));

describe("feed API route", () => {
  beforeEach(() => {
    authMock.mockReset();
    findUniqueMock.mockReset();
    listRecommendedFeedPagePayloadMock.mockReset();
    authMock.mockResolvedValue({ isAuthenticated: false, userId: null });
  });

  it("returns a feed page with parsed pagination", async () => {
    listRecommendedFeedPagePayloadMock.mockResolvedValue({
      items: [{ id: "beat_1" }],
      nextCursor: "next",
      hasMore: true,
    });
    const cursor = Buffer.from(
      JSON.stringify({ seed: 0.42, offset: 10 }),
      "utf8",
    ).toString("base64url");
    const { GET } = await import("@/app/api/feed/route");

    const response = await GET(
      new Request(`https://example.com/api/feed?limit=10&cursor=${cursor}&sessionId=sess_1`),
    );

    expect(response.status).toBe(200);
    expect(listRecommendedFeedPagePayloadMock).toHaveBeenCalledWith({
      limit: 10,
      cursor: {
        seed: 0.42,
        offset: 10,
      },
      sessionId: "sess_1",
      viewerUserId: null,
    });
    expect(await response.json()).toEqual({
      items: [{ id: "beat_1" }],
      nextCursor: "next",
      hasMore: true,
    });
  });

  it("returns 400 for invalid cursors", async () => {
    const { GET } = await import("@/app/api/feed/route");

    const response = await GET(new Request("https://example.com/api/feed?cursor=bad"));

    expect(response.status).toBe(400);
    expect(listRecommendedFeedPagePayloadMock).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: "feed_cursor_invalid",
    });
  });

  it("uses the authenticated local user id when available", async () => {
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "clerk_123" });
    findUniqueMock.mockResolvedValue({ id: "user_123" });
    listRecommendedFeedPagePayloadMock.mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
    });
    const { GET } = await import("@/app/api/feed/route");

    const response = await GET(new Request("https://example.com/api/feed?limit=20"));

    expect(response.status).toBe(200);
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { clerkUserId: "clerk_123" },
      select: { id: true },
    });
    expect(listRecommendedFeedPagePayloadMock).toHaveBeenCalledWith({
      limit: 20,
      viewerUserId: "user_123",
    });
  });
});
