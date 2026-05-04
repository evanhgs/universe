import { beforeEach, describe, expect, it, vi } from "vitest";

const syncCurrentAccountFromClerkMock = vi.fn();
const countUnreadMessagesMock = vi.fn();
const createConversationMock = vi.fn();
const findChatBeatsByIdsMock = vi.fn();
const findChatTargetByBeatSlugMock = vi.fn();
const findChatTargetByProfileSlugMock = vi.fn();
const findExistingConversationMock = vi.fn();
const listUserConversationsMock = vi.fn();

vi.mock("@/server/account/account.sync", () => ({
  syncCurrentAccountFromClerk: syncCurrentAccountFromClerkMock,
}));

vi.mock("@/server/chat/chat.repository", () => ({
  countUnreadMessages: countUnreadMessagesMock,
  createConversation: createConversationMock,
  createTextMessage: vi.fn(),
  findChatBeatsByIds: findChatBeatsByIdsMock,
  findChatTargetByBeatSlug: findChatTargetByBeatSlugMock,
  findChatTargetByProfileSlug: findChatTargetByProfileSlugMock,
  findExistingConversation: findExistingConversationMock,
  findParticipantConversation: vi.fn(),
  listConversationMessages: vi.fn(),
  listUserConversations: listUserConversationsMock,
  markConversationRead: vi.fn(),
}));

function conversation(overrides: Partial<Record<string, unknown>> = {}) {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: "conv_123",
    type: "BEAT_INQUIRY",
    createdById: "buyer_123",
    orderId: null,
    beatId: "beat_123",
    lastMessageAt: null,
    createdAt,
    updatedAt: createdAt,
    participants: [
      {
        id: "part_1",
        conversationId: "conv_123",
        userId: "buyer_123",
        joinedAt: createdAt,
        lastReadAt: createdAt,
        isMuted: false,
        user: {
          id: "buyer_123",
          profile: { displayName: "Buyer", slug: "buyer" },
        },
      },
      {
        id: "part_2",
        conversationId: "conv_123",
        userId: "seller_123",
        joinedAt: createdAt,
        lastReadAt: null,
        isMuted: false,
        user: {
          id: "seller_123",
          profile: { displayName: "Seller", slug: "seller" },
        },
      },
    ],
    messages: [],
    ...overrides,
  };
}

describe("chat service", () => {
  beforeEach(() => {
    syncCurrentAccountFromClerkMock.mockReset().mockResolvedValue({
      id: "buyer_123",
      clerkUserId: "clerk_123",
    });
    countUnreadMessagesMock.mockReset().mockResolvedValue(0);
    createConversationMock.mockReset();
    findChatBeatsByIdsMock.mockReset().mockResolvedValue([
      { id: "beat_123", slug: "beat-one", title: "Beat One" },
    ]);
    findChatTargetByBeatSlugMock.mockReset().mockResolvedValue({
      id: "beat_123",
      slug: "beat-one",
      title: "Beat One",
      ownerId: "seller_123",
    });
    findChatTargetByProfileSlugMock.mockReset();
    findExistingConversationMock.mockReset().mockResolvedValue(conversation());
    listUserConversationsMock.mockReset();
  });

  it("returns an existing beat inquiry without creating a duplicate", async () => {
    const { createOrGetCurrentUserConversation } = await import("@/server/chat/chat.service");

    const result = await createOrGetCurrentUserConversation("clerk_123", {
      beatSlug: "beat-one",
    });

    expect(findExistingConversationMock).toHaveBeenCalledWith({
      userId: "buyer_123",
      targetUserId: "seller_123",
      type: "BEAT_INQUIRY",
      beatId: "beat_123",
    });
    expect(createConversationMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: "conv_123",
      beat: { slug: "beat-one", title: "Beat One" },
    });
  });

  it("rejects self conversations", async () => {
    findChatTargetByProfileSlugMock.mockResolvedValue({
      userId: "buyer_123",
      displayName: "Buyer",
      slug: "buyer",
    });
    const { createOrGetCurrentUserConversation } = await import("@/server/chat/chat.service");

    await expect(
      createOrGetCurrentUserConversation("clerk_123", {
        targetProfileSlug: "buyer",
      }),
    ).rejects.toThrow("self_conversation_forbidden");
  });

  it("sums unread counts and clears per-conversation serialization after read", async () => {
    listUserConversationsMock.mockResolvedValue([conversation()]);
    countUnreadMessagesMock.mockResolvedValue(4);
    const { getCurrentUserUnreadCount, listCurrentUserConversations } = await import(
      "@/server/chat/chat.service"
    );

    await expect(getCurrentUserUnreadCount("clerk_123")).resolves.toEqual({
      unreadCount: 4,
    });
    await expect(listCurrentUserConversations("clerk_123")).resolves.toEqual([
      expect.objectContaining({
        unreadCount: 4,
      }),
    ]);
  });
});
