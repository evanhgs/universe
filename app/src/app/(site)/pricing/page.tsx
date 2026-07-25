import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { Check, Clock3, Headphones, LineChart, ShieldCheck, Sparkles } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getSubscriptionSummaryForClerkUser } from "@/server/subscriptions/subscription.service";

import { PricingActions } from "./pricing-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing | Universe",
  description: "Abonnement Universe pour reduire la commission marketplace et debloquer les outils createurs.",
};

type PricingPageProps = {
  searchParams?: Promise<{
    subscription?: string;
  }>;
};

function getMonthlyLabel() {
  const rawLabel = process.env.UNIVERSE_PRICING_MONTHLY_LABEL?.trim();

  if (!rawLabel) {
    return "8,99 €/mois";
  }

  if (/[^\d\s,.]/.test(rawLabel)) {
    return rawLabel;
  }

  const amount = Number.parseFloat(rawLabel.replace(",", "."));

  if (!Number.isFinite(amount) || amount <= 0) {
    return "8,99 €/mois";
  }

  return `${new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(amount)}/mois`;
}

const monthlyLabel = getMonthlyLabel();

const freeBenefits = [
  "Publication et vente de beats sur la marketplace",
  "Commission standard de 30% sur les ventes",
  "Paiement Stripe Checkout et acces telechargement protege",
  "Profil vendeur public et historique des ventes",
];

const premiumBenefits = [
  "Commission reduite a 9% sur les ventes eligibles",
  "Traitement audio et support plus prioritaires, branchement operationnel a venir",
  "Acces aux outils createurs avances au fil de la V2",
  "Statut premium synchronise automatiquement avec Stripe Billing",
];

/**
 * Page publique de pricing Universe.
 */
export default async function PricingPage({ searchParams }: PricingPageProps = {}) {
  const { userId } = await auth();
  const params = await searchParams;
  const subscription = await getSubscriptionSummaryForClerkUser(userId);

  return (
    <main className="min-h-[calc(100vh-73px)]">
      <section className="border-b border-border">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <Badge className="bg-brand-muted text-brand-dark dark:text-brand-light" variant="secondary">
              {"Monétisation créateur"}
            </Badge>
            <h1 className="mt-5 max-w-3xl text-5xl font-semibold leading-tight tracking-normal text-foreground">
              {"Garde plus de revenus sur chaque vente."}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              {"Universe reste gratuit pour publier et vendre. L'abonnement Universe baisse la commission marketplace de 30% a 9% et prépare les meilleurs outils créateurs de la V2."}
            </p>
          </div>
          <div className="grid gap-4 rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <p className="text-sm text-muted-foreground">Commission actuelle</p>
                <p className="mt-1 text-3xl font-semibold text-foreground">
                  {subscription.commissionRateBp / 100}%
                </p>
              </div>
              <ShieldCheck className="h-10 w-10 text-brand" aria-hidden />
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="font-semibold text-foreground">30%</p>
                <p className="text-muted-foreground">Gratuit</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">9%</p>
                <p className="text-muted-foreground">Universe</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">Stripe</p>
                <p className="text-muted-foreground">Billing</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        {params?.subscription === "success" ? (
          <Alert className="mb-6" variant="success">
            Ton abonnement Universe a bien ete pris en compte. Le statut premium se met a jour
            automatiquement des que Stripe confirme le paiement.
          </Alert>
        ) : null}
        {params?.subscription === "cancelled" ? (
          <Alert className="mb-6" variant="warning">
            {"Le paiement de l'abonnement a ete annule. Aucun changement n'a ete applique."}
          </Alert>
        ) : null}
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium uppercase text-muted-foreground">Gratuit</p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-normal text-foreground">
                    {"Marketplace standard"}
                  </h2>
                </div>
                <Headphones className="h-8 w-8 text-muted-foreground" aria-hidden />
              </div>
              <p className="mt-5 text-4xl font-semibold text-foreground">0 €</p>
              <p className="mt-2 text-sm text-muted-foreground">{"30% de commission par vente."}</p>
              <ul className="mt-6 space-y-3">
                {freeBenefits.map((benefit) => (
                  <li className="flex gap-3 text-sm leading-6 text-muted-foreground" key={benefit}>
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-brand/60 shadow-lg shadow-brand/10">
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium uppercase text-brand">Universe</p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-normal text-foreground">
                    {"Abonnement créateur"}
                  </h2>
                </div>
                <Sparkles className="h-8 w-8 text-brand" aria-hidden />
              </div>
              <p className="mt-5 text-4xl font-semibold text-foreground">{monthlyLabel}</p>
              <p className="mt-2 text-sm text-muted-foreground">{"9% de commission par vente éligible"}.</p>
              <ul className="mt-6 space-y-3">
                {premiumBenefits.map((benefit) => (
                  <li className="flex gap-3 text-sm leading-6 text-muted-foreground" key={benefit}>
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-7">
                <PricingActions isPremium={subscription.isPremium} />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-t border-border bg-muted/35">
        <div className="mx-auto grid w-full max-w-6xl gap-5 px-6 py-10 md:grid-cols-3">
          <div className="flex gap-4">
            <LineChart className="h-6 w-6 shrink-0 text-brand" aria-hidden />
            <div>
              <h3 className="font-semibold text-foreground">Marge plus claire</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {"Le taux est figé au moment de la commande pour garder un ledger fiable."}
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <Clock3 className="h-6 w-6 shrink-0 text-brand" aria-hidden />
            <div>
              <h3 className="font-semibold text-foreground">Priorité future</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {"Le traitement prioritaire sera branché progressivement sur les workers et le support."}
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <ShieldCheck className="h-6 w-6 shrink-0 text-brand" aria-hidden />
            <div>
              <h3 className="font-semibold text-foreground">Statut Stripe</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {"L'abonnement est synchronisé par webhooks Stripe, pas par déclaratif client."}
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
