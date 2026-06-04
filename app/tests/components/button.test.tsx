import Link from "next/link";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders a native button with the requested variant", () => {
    render(<Button variant="outline">Filtrer</Button>);

    const button = screen.getByRole("button", { name: "Filtrer" });

    expect(button).toHaveClass("border");
    expect(button).toHaveClass("border-input");
  });

  it("supports asChild for links", () => {
    render(
      <Button asChild>
        <Link href="/beats">Catalogue</Link>
      </Button>,
    );

    expect(screen.getByRole("link", { name: "Catalogue" })).toHaveAttribute(
      "href",
      "/beats",
    );
  });
});
