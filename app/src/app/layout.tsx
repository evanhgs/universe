import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import Link from "next/link";
import { cookies } from "next/headers";

import { ThemeFooter } from "@/components/theme/theme-footer";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { NotificationViewport } from "@/components/ui/notification";
import { PAGE_PATHS } from "@/lib/paths";

import { AuthActions } from "./auth-buttons";
import { SearchBar } from "./search-bar";
import "./globals.css";

const THEME_STORAGE_KEY = "universe.theme";

export const metadata: Metadata = {
  title: "Universe",
  description: "Universe authentication",
};

/**
 * Layout racine qui installe ClerkProvider et l'en-tete global.
 * @param props.children Contenu de la route Next.js active.
 * @returns Structure HTML globale de l'application.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const themeCookie = (await cookies()).get(THEME_STORAGE_KEY)?.value;
  const initialThemeClass =
    themeCookie === "dark" || themeCookie === "light" ? themeCookie : undefined;

  return (
    <html className={initialThemeClass} lang="fr" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          disableTransitionOnChange
          enableSystem
          storageKey={THEME_STORAGE_KEY}
        >
          <ClerkProvider dynamic>
            <div className="min-h-screen bg-background text-foreground">
              <header className="sticky top-0 z-50 border-b border-border bg-background/85 shadow-sm shadow-black/5 backdrop-blur supports-backdrop-filter:bg-background/70">
                <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-6 sm:py-4">
                  <Link
                    className="shrink-0 text-sm font-semibold uppercase text-muted-foreground"
                    href={PAGE_PATHS.home.getHref()}
                  >
                    Universe
                  </Link>
                  <Link
                    className="shrink-0 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                    href={PAGE_PATHS.pricing.getHref()}
                  >
                    Pricing
                  </Link>
                  <div className="order-3 w-full sm:order-0 sm:min-w-0 sm:flex-1">
                    <SearchBar />
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-3">
                    <AuthActions />
                  </div>
                </div>
              </header>
              <div className="min-h-[calc(100vh-146px)]">{children}</div>
              <NotificationViewport />
              <ThemeFooter />
            </div>
          </ClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
