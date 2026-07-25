import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";

import { MessagesClient } from "./messages-client";

export const dynamic = "force-dynamic";

/**
 * Page messagerie privee.
 * @returns Interface de chat ou invitation a se connecter.
 */
export default async function AccountMessagesPage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return (
      <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-5xl px-6 py-10">
        <p className="text-sm font-medium uppercase text-muted-foreground">
          Messagerie
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
          Connectez-vous pour consulter vos messages.
        </h1>
      </main>
    );
  }

  return (
    <Suspense
      fallback={
        <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-6xl px-6 py-10">
          <p className="text-sm text-muted-foreground">Chargement de la messagerie...</p>
        </main>
      }
    >
      <MessagesClient />
    </Suspense>
  );
}
