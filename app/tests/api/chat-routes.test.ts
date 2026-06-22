import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const createOrGetCurrentUserConversationMock = vi.fn();
const createCurrentUserChatOfferMock = vi.fn();
const getCurrentUserUnreadCountMock = vi.fn();
const listCurrentUserMessagesMock = vi.fn();
const listCurrentUserConversationsMock = vi.fn();
const markCurrentUserConversationReadMock = vi.fn();
const sendCurrentUserMessageMock = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/server/chat/chat.service", () => ({
  createCurrentUserChatOffer: createCurrentUserChatOfferMock,
  createOrGetCurrentUserConversation: createOrGetCurrentUserConversationMock,
  getCurrentUserUnreadCount: getCurrentUserUnreadCountMock,
  listCurrentUserMessages: listCurrentUserMessagesMock,
  listCurrentUserConversations: listCurrentUserConversationsMock,
  markCurrentUserConversationRead: markCurrentUserConversationReadMock,
  sendCurrentUserMessage: sendCurrentUserMessageMock,
}));

describe("chat API routes", () => {
  beforeEach(() => {
    authMock.mockReset();
    createCurrentUserChatOfferMock.mockReset();
    createOrGetCurrentUserConversationMock.mockReset();
    getCurrentUserUnreadCountMock.mockReset();
    listCurrentUserMessagesMock.mockReset();
    listCurrentUserConversationsMock.mockReset();
    markCurrentUserConversationReadMock.mockReset();
    sendCurrentUserMessageMock.mockReset();
  });

  it("returns 401 when listing conversations unauthenticated", async () => {
    authMock.mockResolvedValue({ isAuthenticated: false });
    const { GET } = await import("@/app/api/chat/conversations/route");

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("creates a conversation with normalized payload", async () => {
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "user_123" });
    createOrGetCurrentUserConversationMock.mockResolvedValue({ id: "conv_123" });
    const { POST } = await import("@/app/api/chat/conversations/route");

    const response = await POST(
      new Request("https://example.com/api/chat/conversations", {
        method: "POST",
        body: JSON.stringify({ beatSlug: " beat-one " }),
      }),
    );

    expect(response.status).toBe(201);
    expect(createOrGetCurrentUserConversationMock).toHaveBeenCalledWith("user_123", {
      targetProfileSlug: undefined,
      beatSlug: "beat-one",
    });
    expect(await response.json()).toEqual({ id: "conv_123" });
  });

  it("rejects invalid message payloads before calling the service", async () => {
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "user_123" });
    const { POST } = await import(
      "@/app/api/chat/conversations/[conversationId]/messages/route"
    );

    const response = await POST(
      new Request("https://example.com/api/chat/conversations/conv_123/messages", {
        method: "POST",
        body: JSON.stringify({ body: "" }),
      }),
      { params: Promise.resolve({ conversationId: "conv_123" }) },
    );

    expect(response.status).toBe(400);
    expect(sendCurrentUserMessageMock).not.toHaveBeenCalled();
  });

  it("sends a message for a participant conversation", async () => {
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "user_123" });
    sendCurrentUserMessageMock.mockResolvedValue({ id: "msg_123", body: "Salut" });
    const { POST } = await import(
      "@/app/api/chat/conversations/[conversationId]/messages/route"
    );

    const response = await POST(
      new Request("https://example.com/api/chat/conversations/conv_123/messages", {
        method: "POST",
        body: JSON.stringify({ body: " Salut " }),
      }),
      { params: Promise.resolve({ conversationId: "conv_123" }) },
    );

    expect(response.status).toBe(201);
    expect(sendCurrentUserMessageMock).toHaveBeenCalledWith("user_123", "conv_123", {
      body: "Salut",
    });
  });

  it("creates an exclusive offer from a participant conversation", async () => {
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "user_123" });
    createCurrentUserChatOfferMock.mockResolvedValue({ id: "msg_offer" });
    const { POST } = await import(
      "@/app/api/chat/conversations/[conversationId]/offers/route"
    );

    const response = await POST(
      new Request("https://example.com/api/chat/conversations/conv_123/offers", {
        method: "POST",
        body: JSON.stringify({ amount: 450, message: " Deal " }),
      }),
      { params: Promise.resolve({ conversationId: "conv_123" }) },
    );

    expect(response.status).toBe(201);
    expect(createCurrentUserChatOfferMock).toHaveBeenCalledWith("user_123", "conv_123", {
      amount: 450,
      message: "Deal",
    });
  });

  it("marks a conversation read and returns unread count", async () => {
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "user_123" });
    markCurrentUserConversationReadMock.mockResolvedValue({ ok: true });
    getCurrentUserUnreadCountMock.mockResolvedValue({ unreadCount: 2 });
    const readRoute = await import("@/app/api/chat/conversations/[conversationId]/read/route");
    const unreadRoute = await import("@/app/api/chat/unread-count/route");

    const readResponse = await readRoute.PATCH(
      new Request("https://example.com/api/chat/conversations/conv_123/read", {
        method: "PATCH",
      }),
      { params: Promise.resolve({ conversationId: "conv_123" }) },
    );
    const unreadResponse = await unreadRoute.GET();

    expect(readResponse.status).toBe(200);
    expect(markCurrentUserConversationReadMock).toHaveBeenCalledWith(
      "user_123",
      "conv_123",
    );
    expect(await unreadResponse.json()).toEqual({ unreadCount: 2 });
  });

  it("maps forbidden service errors to 403", async () => {
    authMock.mockResolvedValue({ isAuthenticated: true, userId: "user_123" });
    listCurrentUserMessagesMock.mockRejectedValue(new Error("conversation_forbidden"));
    const { GET } = await import(
      "@/app/api/chat/conversations/[conversationId]/messages/route"
    );

    const response = await GET(
      new Request("https://example.com/api/chat/conversations/conv_123/messages"),
      { params: Promise.resolve({ conversationId: "conv_123" }) },
    );

    expect(response.status).toBe(403);
  });
});
