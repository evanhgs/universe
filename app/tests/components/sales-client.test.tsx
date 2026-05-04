import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SalesClient } from "@/app/account/sales/sales-client";

const getTokenMock = vi.fn();
const openSignInMock = vi.fn();
let clerkState = {
  isLoaded: true,
  isSignedIn: true,
};

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: getTokenMock }),
  useClerk: () => ({ openSignIn: openSignInMock }),
  useUser: () => clerkState,
}));

describe("SalesClient", () => {
  beforeEach(() => {
    clerkState = { isLoaded: true, isSignedIn: true };
    getTokenMock.mockReset().mockResolvedValue("session-token");
    openSignInMock.mockReset();
  });

  it("renders seller revenue, sales, and beats from the dashboard payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "item_123",
                orderId: "order_123",
                orderStatus: "PAID",
                paymentStatus: "SUCCEEDED",
                title: "Night Ride",
                licenseName: "Basic",
                unitAmount: 100,
                quantity: 1,
                lineTotalAmount: 100,
                currency: "EUR",
                createdAt: "2026-01-01T00:00:00.000Z",
                paidAt: "2026-01-01T00:02:00.000Z",
                beat: { id: "beat_123", slug: "night-ride", title: "Night Ride" },
              },
            ],
            count: 1,
            summary: {
              paidSalesCount: 1,
              orderLineCount: 1,
              beatCount: 2,
              publishedBeatCount: 1,
              draftBeatCount: 1,
              processingBeatCount: 0,
              hiddenBeatCount: 0,
              revenueByCurrency: [
                {
                  currency: "EUR",
                  grossPaidAmount: 100,
                  platformCommissionAmount: 30,
                  sellerEarningAmount: 70,
                },
              ],
            },
            beats: [
              {
                id: "beat_123",
                slug: "night-ride",
                title: "Night Ride",
                status: "PUBLISHED",
                visibility: "PUBLIC",
                priceAmount: 100,
                currency: "EUR",
                publishedAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
                paidSalesCount: 1,
              },
              {
                id: "beat_456",
                slug: "draft-one",
                title: "Draft One",
                status: "DRAFT",
                visibility: "PRIVATE",
                priceAmount: 50,
                currency: "EUR",
                publishedAt: null,
                updatedAt: "2026-01-02T00:00:00.000Z",
                paidSalesCount: 0,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    render(<SalesClient />);

    expect(await screen.findByRole("heading", { name: "Dashboard vendeur" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("70,00 €")).toBeInTheDocument();
    });
    expect(screen.getAllByText("100,00 €").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Mes instrus" })).toBeInTheDocument();
    expect(screen.getAllByText("Night Ride").length).toBeGreaterThan(0);
    expect(screen.getByText("Draft One")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Historique des ventes" })).toBeInTheDocument();
  });
});
