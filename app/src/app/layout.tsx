import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import Link from "next/link";

import { AuthActions } from "./auth-buttons";
import { SearchBar } from "./search-bar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Universe",
  description: "Universe authentication",
};

/**
 * Layout racine qui installe ClerkProvider et l'en-tete global.
 * @param props.children Contenu de la route Next.js active.
 * @returns Structure HTML globale de l'application.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        <ClerkProvider dynamic>
          <header className="sticky top-0 z-50 border-b border-black/10 bg-white/85 shadow-sm shadow-black/5 backdrop-blur supports-backdrop-filter:bg-white/70">
            <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-6 sm:py-4">
              <Link
                className="shrink-0 text-sm font-semibold uppercase tracking-[0.2em] text-black/70"
                href="/"
              >
                Universe
              </Link>
              <div className="order-3 w-full sm:order-0 sm:min-w-0 sm:flex-1">
                <SearchBar />
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-3">
                <AuthActions />
              </div>
            </div>
          </header>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
