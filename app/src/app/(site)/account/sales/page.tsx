import { Suspense } from "react";

import { SalesClient } from "./sales-client";

export const dynamic = "force-dynamic";

/**
 * Page serveur qui isole l'interface ventes dans un composant client authentifie.
 * @returns Page "Mes ventes".
 */
export default function SalesPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-5xl px-6 py-10">
          <p className="text-sm text-muted-foreground">Chargement des ventes...</p>
        </main>
      }
    >
      <SalesClient />
    </Suspense>
  );
}
