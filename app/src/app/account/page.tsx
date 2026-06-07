import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { ThemeSelect } from "@/components/theme/theme-select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentAccountSnapshot } from "@/server/account/account.service";

export const dynamic = "force-dynamic";

/**
 * Page compte privee: elle agrege profil, acces achats/ventes et liens de gestion.
 * @returns Tableau de bord du compte courant ou invitation a se connecter.
 */
export default async function AccountPage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return (
      <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-5xl px-6 py-10">
        <p className="text-sm font-medium uppercase text-muted-foreground">
          Compte
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
          {"Connecte-toi pour gérer ton profil."}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {"Le header ouvre Clerk pour la connexion et Universe charge ensuite ton profil local."}
        </p>
      </main>
    );
  }

  const account = await getCurrentAccountSnapshot();
  const isSeller = account.roles.includes("SELLER");
  const fullName = [account.user.firstName, account.user.lastName].filter(Boolean).join(" ");

  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-6xl px-6 py-10">
      <section className="border-b border-border pb-8">
        <p className="text-sm font-medium uppercase text-muted-foreground">
          Mon compte
        </p>
        <div className="mt-3 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">
              {account.profile.displayName}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {account.profile.bio ??
                "Ajoute une bio pour presenter ton univers, ton catalogue ou tes besoins d'achat."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/account/profile">Modifier le profil</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/profiles/${account.profile.slug}`}>Voir le profil public</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identite</CardTitle>
          </CardHeader>
          <CardContent>
          <dl className="grid gap-3 text-sm text-muted-foreground">
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Nom</dt>
              <dd className="mt-1 text-foreground">{fullName || "Non renseigne"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Email</dt>
              <dd className="mt-1 break-all text-foreground">{account.user.email}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Username</dt>
              <dd className="mt-1 text-foreground">{account.user.username ?? "Non renseigne"}</dd>
            </div>
          </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profil public</CardTitle>
          </CardHeader>
          <CardContent>
          <dl className="grid gap-3 text-sm text-muted-foreground">
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Slug</dt>
              <dd className="mt-1 text-foreground">/{account.profile.slug}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Visibilite</dt>
              <dd className="mt-1 text-foreground">
                {account.profile.isPublic ? "Public" : "Prive"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-muted-foreground">Localisation</dt>
              <dd className="mt-1 text-foreground">
                {[account.profile.city, account.profile.countryCode].filter(Boolean).join(", ") ||
                  "Non renseignee"}
              </dd>
            </div>
          </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Roles</CardTitle>
          </CardHeader>
          <CardContent>
          <div className="mt-4 flex flex-wrap gap-2">
            {account.roles.map((role) => (
              <Badge key={role} variant="outline">
                {role}
              </Badge>
            ))}
          </div>
          <CardDescription className="mt-4">
            Tous les comptes restent acheteurs par defaut. Le role vendeur est attribue apres
            verification du compte.
          </CardDescription>
          </CardContent>
        </Card>
      </section>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>{"Préférences d'interface"}</CardTitle>
          <CardDescription>
            {"Le thème reste stocké dans ce navigateur et suit l'ordinateur par defaut."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSelect />
        </CardContent>
      </Card>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold text-foreground">Acces rapides</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Link className="rounded-lg border border-border bg-card p-5 transition hover:border-ring/60" href="/account/messages">
            <h3 className="font-semibold text-foreground">Messages</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Echange avec les vendeurs et les acheteurs depuis Universe.
            </p>
          </Link>
          <Link className="rounded-lg border border-border bg-card p-5 transition hover:border-ring/60" href="/account/purchases">
            <h3 className="font-semibold text-foreground">Mes achats</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Retrouve tes licences payees et tes liens de telechargement.
            </p>
          </Link>
          <Link className="rounded-lg border border-border bg-card p-5 transition hover:border-ring/60" href="/account/sales">
            <h3 className="font-semibold text-foreground">Mes ventes</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Consulte les lignes de commandes vendues avec ton role vendeur.
            </p>
          </Link>
          <Link className="rounded-lg border border-border bg-card p-5 transition hover:border-ring/60 md:col-span-2 xl:col-span-1" href="/beats">
            <h3 className="font-semibold text-foreground">{isSeller ? "Catalogue" : "Explorer"}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {isSeller
                ? "Controle la visibilite de tes instrumentales depuis le catalogue."
                : "Decouvre les instrumentales disponibles avant de passer vendeur."}
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}
