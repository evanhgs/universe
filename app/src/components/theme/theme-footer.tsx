import Link from "next/link";

import { ThemeSelect } from "./theme-select";

const appVersion = "v2.2.1-dev";

export function ThemeFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>{"Universe"}</p>
        <nav className="flex flex-wrap gap-3" aria-label="Liens légaux">
          <Link className="hover:text-foreground" href="/terms-of-service">
            Conditions
          </Link>
          <Link className="hover:text-foreground" href="/privacy-policy">
            Confidentialité
          </Link>
        </nav>
        <p>{`Version: ${appVersion}`}</p>
        <ThemeSelect compact />
      </div>
    </footer>
  );
}
