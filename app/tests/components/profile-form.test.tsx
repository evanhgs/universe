import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileForm } from "@/app/account/profile/profile-form";

const getTokenMock = vi.fn();
const openUserProfileMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: getTokenMock }),
  useClerk: () => ({ openUserProfile: openUserProfileMock }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const initialAccount = {
  user: {
    email: "producer@example.com",
    username: "producer",
    firstName: "Prod",
    lastName: "Maker",
  },
  profile: {
    displayName: "Producer",
    slug: "producer",
    bio: null,
    city: null,
    countryCode: null,
    isPublic: true,
  },
  roles: ["BUYER"],
};

describe("ProfileForm", () => {
  beforeEach(() => {
    getTokenMock.mockReset().mockResolvedValue("session-token");
    openUserProfileMock.mockReset();
    refreshMock.mockReset();
  });

  it("saves profile and self-service roles", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ roles: ["BUYER", "SELLER"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ProfileForm initialAccount={initialAccount} />);

    await userEvent.clear(screen.getByLabelText("Nom public"));
    await userEvent.type(screen.getByLabelText("Nom public"), "Universe Seller");
    await userEvent.clear(screen.getByLabelText(/Slug public/));
    await userEvent.type(screen.getByLabelText(/Slug public/), "universe-seller");
    await userEvent.click(screen.getByLabelText(/Activer le role vendeur/));
    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/account/me/profile",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"displayName":"Universe Seller"'),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/account/me/roles",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ roles: ["BUYER", "SELLER"] }),
      }),
    );
    expect(await screen.findByText("Profil mis a jour.")).toBeInTheDocument();
  });

  it("shows API errors without refreshing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "slug is invalid." }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    render(<ProfileForm initialAccount={initialAccount} />);

    await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("slug is invalid.")).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("opens Clerk user profile settings", async () => {
    render(<ProfileForm initialAccount={initialAccount} />);

    await userEvent.click(screen.getByRole("button", { name: "Ouvrir Clerk" }));

    expect(openUserProfileMock).toHaveBeenCalledTimes(1);
  });
});
