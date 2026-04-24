import type { Metadata } from "next";
import { ClerkProvider, Show } from "@clerk/nextjs";

import { SignedInActions, SignedOutActions } from "./auth-buttons";
import "./globals.css";

export const metadata: Metadata = {
  title: "Universe",
  description: "Universe authentication",
};

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
            <div className="text-sm font-semibold tracking-[0.2em] text-black/70 uppercase">
              Universe
            </div>
            <div className="flex items-center gap-3">
              <Show when="signed-out">
                <SignedOutActions />
              </Show>
              <Show when="signed-in">
                <SignedInActions />
              </Show>
            </div>
          </header>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
