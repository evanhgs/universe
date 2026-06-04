import { ThemeSelect } from "./theme-select";

export function ThemeFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Universe</p>
        <ThemeSelect compact />
      </div>
    </footer>
  );
}
