import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PAGE_PATHS } from "@/lib/paths";

/**
 * Page d'accueil serveur affichant l'etat d'authentification Clerk et les liens principaux.
 * @returns Markup de la page home.
 */
export default async function Home() {
  const { isAuthenticated, userId } = await auth();

  return (
    <main className="mx-auto flex min-h-[calc(100vh-73px)] w-full max-w-6xl flex-col justify-center px-6 py-16">
      <div className="space-y-4">
        <h1 className="text-8xl font-semibold tracking-tight text-foreground uppercase">
          {"Universe"}
          <p className="text-5xl font-semibold tracking-tight text-foreground uppercase">
            {"première marketplace FR "}
          </p>
        </h1>
        <p className="max-w-6xl font-medium leading-7 text-muted-foreground">
          {"Grâce à universe faite plus de stream sur vos meilleurs beats et commencer dès maintenant à faire vos premiers sous*"}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href={PAGE_PATHS.beats.catalog.getHref()}>Voir le catalogue</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href={PAGE_PATHS.account.test.getHref()}>Tester le compte</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href={PAGE_PATHS.feed.getHref()}>Feed decouverte</Link>
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
