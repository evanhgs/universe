import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatContactButton } from "@/app/(site)/chat-contact-button";

const getTokenMock = vi.fn();
const openSignInMock = vi.fn();
const routerPushMock = vi.fn();
let clerkState = {
  isLoaded: true,
  isSignedIn: true,
};

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: getTokenMock }),
  useClerk: () => ({ openSignIn: openSignInMock }),
  useUser: () => clerkState,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

describe("ChatContactButton", () => {
  beforeEach(() => {
    clerkState = { isLoaded: true, isSignedIn: true };
    getTokenMock.mockReset().mockResolvedValue("session-token");
    openSignInMock.mockReset();
    routerPushMock.mockReset();
  });

  it("opens Clerk sign-in for anonymous users", async () => {
    clerkState = { isLoaded: true, isSignedIn: false };

    render(<ChatContactButton label="Contacter" targetProfileSlug="seller-one" />);

    await userEvent.click(screen.getByRole("button", { name: "Contacter" }));

    expect(openSignInMock).toHaveBeenCalledTimes(1);
  });

  it("creates a conversation and opens the thread", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "conv_123" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    render(<ChatContactButton beatSlug="beat-one" label="Contacter le vendeur" />);

    await userEvent.click(screen.getByRole("button", { name: "Contacter le vendeur" }));

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith(
        "/account/messages?conversationId=conv_123",
      );
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/chat/conversations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ beatSlug: "beat-one" }),
      }),
    );
  });
});
