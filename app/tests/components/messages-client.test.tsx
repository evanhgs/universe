import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MessagesClient } from "@/app/(site)/account/messages/messages-client";

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
  beat: {
    id: "beat_123",
    slug: "beat-one",
    title: "Beat One",
    exclusiveOffering: {
      id: "lic_exclusive",
      title: "Exclusive",
      priceAmount: 500,
      currency: "EUR",
    },
  },
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
              offer: null,
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
            offer: null,
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

  it("creates an exclusive offer from a beat conversation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([conversation]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
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
            id: "msg_offer",
            conversationId: "conv_123",
            sender: { id: "user_1", displayName: "Buyer", slug: "buyer" },
            type: "TEXT",
            body: "Proposition d'offre exclusive pour Beat One: 450 EUR.",
            offer: {
              id: "offer_123",
              status: "PENDING",
              amount: 450,
              currency: "EUR",
              beatTitle: "Beat One",
              beatSlug: "beat-one",
              direction: "buyer_offer",
            },
            createdAt: "2026-01-01T00:03:00.000Z",
            editedAt: null,
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    render(<MessagesClient />);

    await screen.findByRole("heading", { name: "Seller : Beat One" });
    await userEvent.click(screen.getByRole("button", { name: "Proposer une offre" }));
    await userEvent.type(screen.getByLabelText("Montant"), "450");
    await userEvent.type(
      screen.getByPlaceholderText("Message optionnel avec le beat mentionne automatiquement..."),
      "Deal cette semaine",
    );
    await userEvent.click(screen.getByRole("button", { name: "Envoyer l'offre" }));

    await waitFor(() => {
      expect(screen.getByText("Offre exclusive - Beat One")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/chat/conversations/conv_123/offers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          amount: 450,
          message: "Deal cette semaine",
        }),
      }),
    );
  });
});
