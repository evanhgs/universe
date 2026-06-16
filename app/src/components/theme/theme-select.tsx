"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import type { ReactElement } from "react";
import { useSyncExternalStore } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const themeLabels = {
  dark: "Sombre",
  light: "Clair",
  system: "Ordinateur",
} as const;
const THEME_STORAGE_KEY = "universe.theme";

type ThemeChoice = keyof typeof themeLabels;

type ThemeSelectProps = {
  className?: string;
  compact?: boolean;
};

export function ThemeSelect({ className, compact = false }: ThemeSelectProps) {
  const { setTheme, theme } = useTheme();
  const isMounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  const currentTheme =
    theme === "light" || theme === "dark" || theme === "system" ? theme : "system";

  function persistTheme(value: string) {
    setTheme(value);

    if (value === "light" || value === "dark" || value === "system") {
      document.cookie = `${THEME_STORAGE_KEY}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
    }
  }

  return (
    <div className={cn("grid gap-2", className)}>
      {compact ? null : (
        <div>
          <p className="text-sm font-medium text-foreground">Theme</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Clair, sombre ou theme de l&apos;ordinateur.
          </p>
        </div>
      )}
      <Select
        disabled={!isMounted}
        onValueChange={persistTheme}
        value={isMounted ? currentTheme : "system"}
      >
        <SelectTrigger
          aria-label="Choisir le theme"
          className={cn(compact ? "h-9 w-40 rounded-full" : "w-full")}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <ThemeOption icon={<Monitor aria-hidden="true" />} value="system" />
          <ThemeOption icon={<Sun aria-hidden="true" />} value="light" />
          <ThemeOption icon={<Moon aria-hidden="true" />} value="dark" />
        </SelectContent>
      </Select>
    </div>
  );
}

function ThemeOption({
  icon,
  value,
}: {
  icon: ReactElement;
  value: ThemeChoice;
}) {
  return (
    <SelectItem value={value}>
      <span className="flex items-center gap-2">
        <span className="[&_svg]:size-4">{icon}</span>
        {themeLabels[value]}
      </span>
    </SelectItem>
  );
}
