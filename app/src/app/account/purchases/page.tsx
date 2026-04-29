import { Suspense } from "react";

import { PurchasesClient } from "./purchases-client";

export const dynamic = "force-dynamic";

/**
 * Page serveur qui encapsule le client d'achats dans un Suspense.
 * @returns Page "Mes achats".
 */
export default function PurchasesPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-5xl px-6 py-10">
          <p className="text-sm text-black/60">Chargement des achats...</p>
        </main>
      }
    >
      <PurchasesClient />
    </Suspense>
  );
}
