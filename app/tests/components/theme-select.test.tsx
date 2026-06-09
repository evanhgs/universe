import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeSelect } from "@/components/theme/theme-select";

const setThemeMock = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => ({
    setTheme: setThemeMock,
    theme: "system",
  }),
}));

describe("ThemeSelect", () => {
  beforeEach(() => {
    setThemeMock.mockReset();
    document.cookie = "universe.theme=; path=/; max-age=0";
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("lets the user choose a persisted theme value", async () => {
    render(<ThemeSelect />);

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Choisir le theme" })).toBeEnabled();
    });

    await userEvent.click(screen.getByRole("combobox", { name: "Choisir le theme" }));
    await userEvent.click(screen.getByRole("option", { name: /Sombre/ }));

    expect(setThemeMock).toHaveBeenCalledWith("dark");
    expect(document.cookie).toContain("universe.theme=dark");
  });
});
