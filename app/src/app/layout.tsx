import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { cookies } from "next/headers";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { NotificationViewport } from "@/components/ui/notification";

import "./globals.css";

const THEME_STORAGE_KEY = "universe.theme";

export const metadata: Metadata = {
  title: "Universe — Beat marketplace",
  description:
    "Universe est la marketplace FR des beats : catalogue immersif, feed Rush et licences pour beatmakers et artistes.",
};

/**
 * Layout racine qui installe les providers globaux (Clerk, theme, notifications).
 * L'en-tete et le footer classiques vivent dans le groupe (site) pour laisser
 * la landing immersive occuper tout l'ecran.
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
            {children}
            <NotificationViewport />
          </ClerkProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
