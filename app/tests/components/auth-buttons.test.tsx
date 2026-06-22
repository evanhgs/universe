import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignedInActions } from "@/app/auth-buttons";

const getTokenMock = vi.fn();
const openUserProfileMock = vi.fn();
const signOutMock = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  SignInButton: () => <button type="button">Sign in</button>,
  useAuth: () => ({ getToken: getTokenMock }),
  useClerk: () => ({
    openUserProfile: openUserProfileMock,
    signOut: signOutMock,
  }),
  useUser: () => ({
    user: {
      fullName: "Fallback Name",
      imageUrl: "",
      primaryEmailAddress: { emailAddress: "fallback@example.com" },
    },
  }),
}));

describe("SignedInActions", () => {
  beforeEach(() => {
    getTokenMock.mockReset().mockResolvedValue("session-token");
    openUserProfileMock.mockReset();
    signOutMock.mockReset();
  });

  it("loads account data and renders seller links in the menu", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            profile: { displayName: "Universe Seller", slug: "universe-seller" },
            roles: ["BUYER", "SELLER"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(<SignedInActions />);

    await waitFor(() => {
      expect(screen.getByText("Universe Seller")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { expanded: false }));

    expect(screen.getByRole("menuitem", { name: "Mes ventes" })).toHaveAttribute(
      "href",
      "/account/sales",
    );
  });

  it("closes the menu with Escape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ profile: { displayName: "Buyer", slug: "buyer" }, roles: ["BUYER"] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    render(<SignedInActions />);

    await waitFor(() => {
      expect(screen.getByText("Buyer")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole("button", { expanded: false }));

    expect(screen.getByRole("menu")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
