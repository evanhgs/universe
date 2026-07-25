import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BeatPurchasePanel } from "@/app/(site)/beats/[slug]/beat-purchase-panel";

const openSignInMock = vi.fn();
const getTokenMock = vi.fn();
let clerkState = {
  isLoaded: true,
  isSignedIn: true,
};

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: getTokenMock }),
  useClerk: () => ({ openSignIn: openSignInMock }),
  useUser: () => clerkState,
}));

const licenseOfferings = [
  {
    id: "lic_123",
    title: "Basic",
    description: "MP3 tagged",
    scope: "BASIC",
    priceAmount: 29,
    currency: "EUR",
  },
];

describe("BeatPurchasePanel", () => {
  beforeEach(() => {
    clerkState = { isLoaded: true, isSignedIn: true };
    openSignInMock.mockReset();
    getTokenMock.mockReset().mockResolvedValue("session-token");
  });

  it("disables purchase for the beat owner", () => {
    render(
      <BeatPurchasePanel
        beatSlug="my-beat"
        checkoutCancelled={false}
        isOwner
        licenseOfferings={licenseOfferings}
      />,
    );

    expect(screen.getByRole("button", { name: "Indisponible pour le vendeur" })).toBeDisabled();
  });

  it("opens Clerk sign-in for anonymous buyers", async () => {
    clerkState = { isLoaded: true, isSignedIn: false };
    render(
      <BeatPurchasePanel
        beatSlug="my-beat"
        checkoutCancelled={false}
        isOwner={false}
        licenseOfferings={licenseOfferings}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Se connecter pour acheter" }));

    expect(openSignInMock).toHaveBeenCalledTimes(1);
  });

  it("creates an order and redirects to Stripe checkout", async () => {
    const assignMock = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "order_123" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ checkoutUrl: "https://stripe.test/checkout" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        origin: "http://localhost:3000",
        assign: assignMock,
      },
    });

    render(
      <BeatPurchasePanel
        beatSlug="my-beat"
        checkoutCancelled={false}
        isOwner={false}
        licenseOfferings={licenseOfferings}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Acheter" }));

    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith("https://stripe.test/checkout");
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/marketplace/orders",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ licenseOfferingId: "lic_123" }),
      }),
    );
  });

  it("shows readable API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "already_purchased" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    render(
      <BeatPurchasePanel
        beatSlug="my-beat"
        checkoutCancelled={false}
        isOwner={false}
        licenseOfferings={licenseOfferings}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Acheter" }));

    expect(
      await screen.findByText("Tu as deja achete cette licence. Retrouve-la dans Mes achats."),
    ).toBeInTheDocument();
  });
});
