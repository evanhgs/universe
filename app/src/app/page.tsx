import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

/**
 * Page d'accueil serveur affichant l'etat d'authentification Clerk et les liens principaux.
 * @returns Markup de la page home.
 */
export default async function Home() {
  const { isAuthenticated, userId } = await auth();

  return (
    <main className="mx-auto flex min-h-[calc(100vh-73px)] w-full max-w-4xl flex-col justify-center px-6 py-16">
      <div className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-[0.3em] text-black/45">
          Marketplace musicale V1
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-black">
          Les bases publication et catalogue sont branchees.
        </h1>
        <p className="max-w-2xl text-base leading-7 text-black/70">
          Universe avance sur le flux inscription, profil vendeur, publication
          d instrumentales et consultation publique du catalogue.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            className="inline-flex h-11 items-center justify-center rounded-full bg-black px-5 text-sm font-medium text-white"
            href="/beats"
          >
            Voir le catalogue
          </Link>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-full border border-black/15 px-5 text-sm font-medium text-black"
            href="/account-test"
          >
            Tester le compte
          </Link>
        </div>
        <div className="rounded-2xl border border-black/10 bg-black/[0.03] p-5">
          <p className="text-sm text-black/60">
            Status: {isAuthenticated ? "signed in" : "signed out"}
          </p>
          <p className="mt-2 font-mono text-sm text-black/80">
            {userId ?? "No active Clerk user session"}
          </p>
        </div>
      </div>
    </main>
  );
}
