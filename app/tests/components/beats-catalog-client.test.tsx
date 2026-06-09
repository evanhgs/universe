import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BeatsCatalogClient } from "@/app/beats/beats-catalog-client";

function beat(id: number, title = `Beat ${id}`) {
  return {
    id: `beat_${id}`,
    slug: `beat-${id}`,
    title,
    description: "Description",
    priceAmount: 29,
    currency: "EUR",
    primaryGenre: "TRAP",
    isFree: false,
    seller: {
      slug: "seller",
      displayName: "Seller",
    },
    assets: [],
  };
}

const initialPage = {
  items: [beat(1)],
  count: 1,
  page: 1,
  limit: 20,
  totalItems: 1,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
};

describe("BeatsCatalogClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/beats");
  });

  it("loads filtered beats without navigating the whole page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [beat(2, "Filtered Beat")],
          count: 1,
          page: 1,
          limit: 20,
          totalItems: 1,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BeatsCatalogClient
        initialFilters={{
          limit: 20,
          page: 1,
        }}
        initialPage={initialPage}
      />,
    );

    expect(screen.getByText("Beat 1")).toBeInTheDocument();

    await userEvent.type(
      screen.getByPlaceholderText("Rechercher par titre, description ou tag"),
      "filtered",
    );
    await userEvent.click(screen.getByRole("button", { name: "Filtrer" }));

    await waitFor(() => {
      expect(screen.getByText("Filtered Beat")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/beats?search=filtered&limit=20",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(pushStateSpy).toHaveBeenCalledWith(null, "", "/beats?search=filtered&limit=20");
  });

  it("responds to global search events on the beats page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [beat(3, "Header Search Beat")],
          count: 1,
          page: 1,
          limit: 20,
          totalItems: 1,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BeatsCatalogClient
        initialFilters={{
          limit: 20,
          page: 1,
        }}
        initialPage={initialPage}
      />,
    );

    window.dispatchEvent(
      new CustomEvent("beats:catalog-search", {
        detail: { search: "header" },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("Header Search Beat")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/beats?search=header&limit=20",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("uses the resolved page returned by the API when a requested page is too high", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [beat(4, "Last Valid Page Beat")],
          count: 1,
          page: 3,
          limit: 20,
          totalItems: 41,
          totalPages: 3,
          hasPreviousPage: true,
          hasNextPage: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const pushStateSpy = vi.spyOn(window.history, "pushState");
    vi.stubGlobal("fetch", fetchMock);

    render(
      <BeatsCatalogClient
        initialFilters={{
          limit: 20,
          page: 24,
        }}
        initialPage={{
          ...initialPage,
          page: 24,
          totalItems: 41,
          totalPages: 3,
          hasPreviousPage: true,
        }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Precedent" }));

    await waitFor(() => {
      expect(screen.getByText("Last Valid Page Beat")).toBeInTheDocument();
    });
    expect(pushStateSpy).toHaveBeenCalledWith(null, "", "/beats?limit=20&page=3");
    expect(screen.getByText("Page 3 / 3 - 20 resultats par page")).toBeInTheDocument();
  });
});
