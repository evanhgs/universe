"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PAGE_PATHS } from "@/lib/paths";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: PAGE_PATHS.beats.catalog.path, label: "Marketplace" },
  { href: PAGE_PATHS.rush.path, label: "Rush", accent: true },
  { href: PAGE_PATHS.pricing.path, label: "Pricing" },
] as const;

/**
 * Navigation principale du header classique : acces directs Marketplace,
 * Rush et Pricing avec etat actif selon la route courante.
 */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navigation principale" className="flex shrink-0 items-center gap-1">
      {LINKS.map((link) => {
        const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition",
              isActive
                ? "bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            href={link.href}
            key={link.href}
          >
            {"accent" in link && link.accent ? (
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-primary" />
            ) : null}
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
