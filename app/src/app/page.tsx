import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Page d'accueil serveur affichant l'etat d'authentification Clerk et les liens principaux.
 * @returns Markup de la page home.
 */
export default async function Home() {
  const { isAuthenticated, userId } = await auth();

  return (
    <main className="mx-auto flex min-h-[calc(100vh-73px)] w-full max-w-4xl flex-col justify-center px-6 py-16">
      <div className="space-y-4">
        <p className="text-sm font-medium uppercase text-muted-foreground">
          Marketplace musicale V1
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">
          Les bases publication et catalogue sont branchees.
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">
          Universe avance sur le flux inscription, profil vendeur, publication
          d instrumentales et consultation publique du catalogue.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/beats">Voir le catalogue</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/account-test">Tester le compte</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/feed">Feed decouverte</Link>
          </Button>
        </div>
        <Card>
          <CardContent className="p-5">
          <p className="text-sm text-muted-foreground">
            Status: {isAuthenticated ? "signed in" : "signed out"}
          </p>
          <p className="mt-2 font-mono text-sm text-foreground">
            {userId ?? "No active Clerk user session"}
          </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
