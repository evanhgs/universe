import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MessagesClient } from "@/app/account/messages/messages-client";

const getTokenMock = vi.fn();
const routerReplaceMock = vi.fn();
let currentSearch = "conversationId=conv_123";

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: getTokenMock }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplaceMock }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

const conversation = {
  id: "conv_123",
  type: "BEAT_INQUIRY",
  beat: { id: "beat_123", slug: "beat-one", title: "Beat One" },
  participants: [
    { id: "user_1", displayName: "Buyer", slug: "buyer" },
    { id: "user_2", displayName: "Seller", slug: "seller" },
  ],
  otherParticipants: [{ id: "user_2", displayName: "Seller", slug: "seller" }],
  lastMessage: null,
  lastMessageAt: null,
  unreadCount: 3,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("MessagesClient", () => {
  beforeEach(() => {
    currentSearch = "conversationId=conv_123";
    getTokenMock.mockReset().mockResolvedValue("session-token");
    routerReplaceMock.mockReset();
  });

  it("loads conversations, marks unread as read, and sends a message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([conversation]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "msg_1",
              conversationId: "conv_123",
              sender: { id: "user_2", displayName: "Seller", slug: "seller" },
              type: "TEXT",
              body: "Salut",
              createdAt: "2026-01-01T00:01:00.000Z",
              editedAt: null,
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "msg_2",
            conversationId: "conv_123",
            sender: { id: "user_1", displayName: "Buyer", slug: "buyer" },
            type: "TEXT",
            body: "Bonjour\nencore",
            createdAt: "2026-01-01T00:02:00.000Z",
            editedAt: null,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    render(<MessagesClient />);

    expect(await screen.findByRole("heading", { name: "Seller : Beat One" })).toBeInTheDocument();
    expect(await screen.findByText("Salut")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("3")).not.toBeInTheDocument();
    });

    const messageField = screen.getByLabelText("Message");
    await userEvent.type(messageField, "Bonjour{Shift>}{Enter}{/Shift}encore");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(messageField).toHaveValue("Bonjour\nencore");

    await userEvent.type(messageField, "{Enter}");

    await waitFor(() => {
      expect(
        screen.getAllByText((_, element) => element?.textContent === "Bonjour\nencore").length,
      ).toBeGreaterThan(0);
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/chat/conversations/conv_123/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ body: "Bonjour\nencore" }),
      }),
    );
  });
});
