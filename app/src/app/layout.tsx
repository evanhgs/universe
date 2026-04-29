import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import Link from "next/link";

import { AuthActions } from "./auth-buttons";
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
    <html lang="en">
      <body>
        <ClerkProvider dynamic>
          <header className="flex items-center justify-between border-b border-black/10 px-6 py-4">
            <Link
              className="text-sm font-semibold tracking-[0.2em] text-black/70 uppercase"
              href="/"
            >
              Universe
            </Link>
            <div className="flex items-center gap-3">
              <AuthActions />
            </div>
          </header>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
