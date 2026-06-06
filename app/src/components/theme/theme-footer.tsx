import { ThemeSelect } from "./theme-select";

const appVersion = "0.5.0-alpha";

export function ThemeFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>{"Universe"}</p>
        <p>{`Version: ${appVersion}`}</p>
        <ThemeSelect compact />
      </div>
    </footer>
  );
}
