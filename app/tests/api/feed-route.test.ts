import { beforeEach, describe, expect, it, vi } from "vitest";

const listPublishedFeedPagePayloadMock = vi.fn();

vi.mock("@/server/beats/beat.service", () => ({
  listPublishedFeedPagePayload: listPublishedFeedPagePayloadMock,
}));

describe("feed API route", () => {
  beforeEach(() => {
    listPublishedFeedPagePayloadMock.mockReset();
  });

  it("returns a feed page with parsed pagination", async () => {
    listPublishedFeedPagePayloadMock.mockResolvedValue({
      items: [{ id: "beat_1" }],
      nextCursor: "next",
      hasMore: true,
    });
    const cursor = Buffer.from(
      JSON.stringify({ publishedAt: "2026-05-31T12:00:00.000Z", id: "beat_0" }),
      "utf8",
    ).toString("base64url");
    const { GET } = await import("@/app/api/feed/route");

    const response = await GET(
      new Request(`https://example.com/api/feed?limit=10&cursor=${cursor}`),
    );

    expect(response.status).toBe(200);
    expect(listPublishedFeedPagePayloadMock).toHaveBeenCalledWith({
      limit: 10,
      cursor: {
        publishedAt: "2026-05-31T12:00:00.000Z",
        id: "beat_0",
      },
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
    expect(listPublishedFeedPagePayloadMock).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: "feed_cursor_invalid",
    });
  });
});
