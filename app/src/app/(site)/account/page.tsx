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
import { PAGE_PATHS } from "@/lib/paths";
import { getCurrentAccountSnapshot } from "@/server/account/account.service";
import { getSubscriptionSummaryForUserId } from "@/server/subscriptions/subscription.service";

import { SubscriptionPortalButton } from "./subscription-portal-button";

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
  const subscription = await getSubscriptionSummaryForUserId(account.user.id);
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
            {subscription.isPremium ? (
              <Badge className="mt-3 bg-brand-muted text-brand-dark dark:text-brand-light">
                Universe actif
              </Badge>
            ) : null}
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {account.profile.bio ??
                "Ajoute une bio pour presenter ton univers, ton catalogue ou tes besoins d'achat."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href={PAGE_PATHS.account.profile.getHref()}>Modifier le profil</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={PAGE_PATHS.profiles.detail.getHref(account.profile.slug)}>Voir le profil public</Link>
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
            <CardTitle>Abonnement Universe</CardTitle>
            <CardDescription>
              {"Gere la facturation Stripe, la pause si elle est activee dans Stripe, les moyens de paiement et l'annulation depuis le portail securise."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="mt-1 text-sm leading-6">
                Commission actuelle: {subscription.commissionRateBp / 100}%
                {subscription.currentPeriodEnd
                  ? ` Prochaine echeance: ${new Intl.DateTimeFormat("fr-FR", {
                      dateStyle: "long",
                    }).format(new Date(subscription.currentPeriodEnd))}.`
                  : ""}
              </p>
            </div>
            {subscription.canManageSubscription ? (
              <SubscriptionPortalButton />
            ) : (
              <Button asChild>
                <Link href={PAGE_PATHS.pricing.getHref()}>Passer à Universe</Link>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{"Outils créateurs"}</CardTitle>
            <CardDescription className="mt-4">
              {"Accéder au dashboard vendeur pour suivre et tracker vos ventes grâce à nos outils performants."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild>
                <Link href={PAGE_PATHS.account.sales.getHref()}>Dashboard vendeur</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold text-foreground">{"Accès rapides"}</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Link className="rounded-lg border border-border bg-card p-5 transition hover:border-ring/60" href={PAGE_PATHS.account.messages.getHref()}>
            <h3 className="font-semibold text-foreground">Messagerie</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {"Echangez avec les vendeurs et les acheteurs depuis la messagerie sécurisée Universe"}
            </p>
          </Link>
          <Link className="rounded-lg border border-border bg-card p-5 transition hover:border-ring/60" href={PAGE_PATHS.account.purchases.getHref()}>
            <h3 className="font-semibold text-foreground">Mes achats</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {"Retrouvez vos beats payés et vos liens de téléchargement."}
            </p>
          </Link>
          <Link className="rounded-lg border border-border bg-card p-5 transition hover:border-ring/60 md:col-span-2 xl:col-span-1" href={PAGE_PATHS.beats.catalog.getHref()}>
            <h3 className="font-semibold text-foreground">Catalogue</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {"Retrouvez tout le contenu de Universe grâce au catalogue de beat."} 
            </p>
          </Link>
          <Link className="rounded-lg border border-border bg-card p-5 transition hover:border-ring/60" href={PAGE_PATHS.rush.getHref()}>
            <h3 className="font-semibold text-foreground">Rush</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {"Découvrez de nouvelles pépites grâce au contenu rapide et personnalisé"}
            </p>
          </Link>
        </div>
      </section>
      
      <section className="mt-8">
        <h2 className="text-2xl font-semibold text-foreground">{"Préférences"}</h2>
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
      </section>
    </main>
  );
}
