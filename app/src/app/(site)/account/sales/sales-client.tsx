"use client";

import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { API_PATHS, PAGE_PATHS } from "@/lib/paths";

type SaleItem = {
  id: string;
  orderId: string;
  orderStatus: string;
  paymentStatus: string | null;
  title: string;
  licenseName: string | null;
  unitAmount: number;
  quantity: number;
  lineTotalAmount: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  beat: {
    id: string;
    slug: string;
    title: string;
  } | null;
};

type SalesResponse = {
  items: SaleItem[];
  count: number;
  summary?: {
    paidSalesCount: number;
    orderLineCount: number;
    beatCount: number;
    publishedBeatCount: number;
    draftBeatCount: number;
    processingBeatCount: number;
    hiddenBeatCount: number;
    revenueByCurrency: Array<{
      currency: string;
      grossPaidAmount: number;
      platformCommissionAmount: number;
      sellerEarningAmount: number;
    }>;
    payoutEligibility?: {
      canReceivePayouts: boolean;
      kycStatus: string | null;
      payoutAccountReady: boolean;
      reason: string | null;
    };
  };
  beats?: SellerBeat[];
  analyticsSummary?: SellerAnalyticsSummary;
  beatPerformance?: SellerBeatPerformance[];
  exclusiveOffers?: ExclusiveOffer[];
  promotions?: Promotion[];
};

type SellerBeat = {
  id: string;
  slug: string;
  title: string;
  status: string;
  visibility: string;
  priceAmount: number | null;
  currency: string;
  publishedAt: string | null;
  updatedAt: string;
  paidSalesCount: number;
};

type SellerAnalyticsSummary = {
  impressions: number;
  plays: number;
  fullPlays: number;
  licenseClicks: number;
  addToCart: number;
  purchases: number;
  revenue: number;
  playRate: number;
  licenseClickRate: number;
  conversionRate: number;
};

type SellerBeatPerformance = SellerBeat & {
  impressions: number;
  plays: number;
  fullPlays: number;
  licenseClicks: number;
  addToCart: number;
  purchases: number;
  revenue: number;
  conversionRate: number;
};

type ExclusiveOffer = {
  id: string;
  status: string;
  proposedAmount: number;
  counterAmount: number | null;
  acceptedAmount: number | null;
  currency: string;
  buyerMessage: string | null;
  sellerMessage: string | null;
  expiresAt: string | null;
  createdAt: string;
  beat: {
    id: string;
    slug: string;
    title: string;
  };
  buyer: {
    id: string;
    displayName: string | null;
  };
};

type Promotion = {
  id: string;
  type: string;
  discountType: string;
  title: string;
  code: string | null;
  discountValue: number;
  currency: string | null;
  minItems: number;
  usageLimit: number | null;
  usageCount: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

type JsonBody = {
  error?: unknown;
  message?: unknown;
};

const buttonClass =
  "inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground";
const secondaryButtonClass =
  "inline-flex h-10 items-center justify-center rounded-full border border-input px-4 text-sm font-medium text-foreground";

/**
 * Formate un montant de vente dans sa devise.
 * @param value Montant decimal.
 * @param currency Code devise ISO.
 */
function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
  }).format(value);
}

/**
 * Formate une date ISO nullable pour l'historique vendeur.
 * @param value Date ISO ou null.
 */
function formatDate(value: string | null) {
  if (!value) {
    return "Non renseigne";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(value);
}

/**
 * Traduit un statut beat pour un dashboard vendeur lisible.
 * @param status Statut brut Prisma/API.
 */
function beatStatusLabel(status: string) {
  if (status === "PUBLISHED") {
    return "Publiée";
  }

  if (status === "PROCESSING") {
    return "En traitement";
  }

  if (status === "DRAFT") {
    return "Brouillon";
  }

  if (status === "HIDDEN") {
    return "Masquée";
  }

  if (status === "ARCHIVED") {
    return "Archivée";
  }

  return status;
}

/**
 * Parse une reponse JSON et conserve le code API utile pour l'affichage.
 * @param response Reponse fetch a parser.
 */
async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as JsonBody).message)
        : body && typeof body === "object" && "error" in body
          ? String((body as JsonBody).error)
          : `HTTP ${response.status}`;

    throw new Error(message);
  }

  return body as T;
}

/**
 * Traduit les erreurs API attendues pour la page ventes.
 * @param error Code ou message brut.
 */
function errorMessage(error: string) {
  if (error === "unauthorized" || error === "HTTP 401") {
    return "Connecte-toi pour consulter tes ventes.";
  }

  return error;
}

function exclusiveOfferStatusLabel(status: string) {
  if (status === "PENDING") return "A valider";
  if (status === "COUNTERED") return "Contre-offre";
  if (status === "ACCEPTED") return "Acceptee";
  if (status === "PAID") return "Payee";
  if (status === "REJECTED") return "Refusee";
  if (status === "EXPIRED") return "Expiree";

  return status;
}

function promotionDiscountLabel(promotion: Promotion) {
  const value = promotion.discountType === "PERCENT"
    ? formatPercent(promotion.discountValue / 100)
    : formatMoney(promotion.discountValue, promotion.currency ?? "EUR");

  return promotion.type === "BUNDLE"
    ? `${value} des ${promotion.minItems} instrus`
    : `${value} avec ${promotion.code ?? "code"}`;
}

/**
 * Traduit l'etat payout en message actionnable pour le vendeur.
 * @param reason Code serveur d'eligibilite payout.
 */
function payoutStatusLabel(reason: string | null | undefined) {
  if (reason === null) {
    return "Retraits disponibles";
  }

  if (reason === "PENDING_KYC") {
    return "Vérification d'identitée requise avant le retrait";
  }

  if (reason === "PAYOUT_ACCOUNT_REQUIRED") {
    return "Compte de retrait à configurer";
  }

  if (reason === "ACCOUNT_NOT_ACTIVE") {
    return "Compte inactif";
  }

  return "Retrait indisponible";
}

/**
 * Liste les lignes de commandes vendues par l'utilisateur connecte.
 * @returns Interface vendeur simple pour la V1.
 */
export function SalesClient() {
  const { openSignIn } = useClerk();
  const { getToken } = useAuth();
  const { isLoaded, isSignedIn } = useUser();
  const [sales, setSales] = useState<SaleItem[]>([]);
  const [beats, setBeats] = useState<SellerBeat[]>([]);
  const [beatPerformance, setBeatPerformance] = useState<SellerBeatPerformance[]>([]);
  const [analyticsSummary, setAnalyticsSummary] = useState<SellerAnalyticsSummary | null>(null);
  const [exclusiveOffers, setExclusiveOffers] = useState<ExclusiveOffer[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [summary, setSummary] = useState<SalesResponse["summary"] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fallbackGrossPaid = useMemo(
    () =>
      sales
        .filter((sale) => sale.orderStatus === "PAID")
        .reduce((sum, sale) => sum + sale.lineTotalAmount, 0),
    [sales],
  );
  const primaryRevenue = summary?.revenueByCurrency[0] ?? null;
  const currency = primaryRevenue?.currency ?? sales[0]?.currency ?? "EUR";
  const grossPaid = primaryRevenue?.grossPaidAmount ?? fallbackGrossPaid;
  const sellerEarning = primaryRevenue?.sellerEarningAmount ?? fallbackGrossPaid;
  const activePromotions = promotions.filter((promotion) => promotion.isActive);
  const pendingExclusiveOffers = exclusiveOffers.filter((offer) =>
    ["PENDING", "COUNTERED"].includes(offer.status),
  );
  const underperformingBeats = beatPerformance
    .filter((beat) => beat.impressions >= 100 && beat.conversionRate < 0.01)
    .slice(0, 3);
  const performanceRows = beatPerformance.length > 0
    ? beatPerformance
    : beats.map((beat) => ({
        ...beat,
        impressions: 0,
        plays: 0,
        fullPlays: 0,
        licenseClicks: 0,
        addToCart: 0,
        purchases: beat.paidSalesCount,
        revenue: 0,
        conversionRate: 0,
      }));

  const buildAuthHeaders = useCallback(async (base: HeadersInit = {}) => {
    const headers = new Headers(base);
    const token = await getToken();

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    return headers;
  }, [getToken]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    let isCancelled = false;

    /**
     * Charge les ventes apres resolution de l'etat Clerk.
     */
    async function run() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await readJsonResponse<SalesResponse>(
          await fetch(API_PATHS.marketplace.sales(), {
            credentials: "same-origin",
            headers: await buildAuthHeaders({
              Accept: "application/json",
            }),
          }),
        );

        if (!isCancelled) {
          setSales(response.items);
          setBeats(response.beats ?? []);
          setBeatPerformance(response.beatPerformance ?? []);
          setAnalyticsSummary(response.analyticsSummary ?? null);
          setExclusiveOffers(response.exclusiveOffers ?? []);
          setPromotions(response.promotions ?? []);
          setSummary(response.summary ?? null);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(errorMessage(err instanceof Error ? err.message : "Erreur inconnue."));
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void run();

    return () => {
      isCancelled = true;
    };
  }, [buildAuthHeaders, isLoaded, isSignedIn]);

  if (!isLoaded || isLoading) {
    return (
      <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-5xl px-6 py-10">
        <p className="text-sm text-muted-foreground">Chargement des ventes...</p>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-5xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Mes ventes</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Connecte-toi pour consulter ton historique vendeur.
        </p>
        <button className={`mt-6 ${buttonClass}`} onClick={() => openSignIn()} type="button">
          Se connecter
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-6xl px-6 py-10">
      <div className="border-b border-border pb-8">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
          Marketplace
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
          Dashboard vendeur
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Consulte tes ventes, tes revenus et l&apos;etat de tes instrumentales.
        </p>
      </div>

      {error ? (
        <div className="mt-6 border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm font-medium text-rose-700">{error}</p>
        </div>
      ) : null}

      <section className="mt-8 grid gap-4 md:grid-cols-4">
        <article className="border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Ventes payees</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">
            {summary?.paidSalesCount ?? sales.filter((sale) => sale.orderStatus === "PAID").length}
          </p>
        </article>
        <article className="border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Revenu net vendeur</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">
            {formatMoney(sellerEarning, currency)}
          </p>
        </article>
        <article className="border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Revenu brut</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">
            {formatMoney(grossPaid, currency)}
          </p>
        </article>
        <article className="border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Instrus</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">
            {summary?.beatCount ?? beats.length}
          </p>
        </article>
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-4">
        <article className="border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Publiees</p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {summary?.publishedBeatCount ?? beats.filter((beat) => beat.status === "PUBLISHED").length}
          </p>
        </article>
        <article className="border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Brouillons</p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {summary?.draftBeatCount ?? beats.filter((beat) => beat.status === "DRAFT").length}
          </p>
        </article>
        <article className="border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Traitement</p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {summary?.processingBeatCount ?? beats.filter((beat) => beat.status === "PROCESSING").length}
          </p>
        </article>
        <article className="border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Masquees</p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {summary?.hiddenBeatCount ?? beats.filter((beat) => beat.status === "HIDDEN").length}
          </p>
        </article>
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-4">
        <article className="border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Impressions</p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {formatInteger(analyticsSummary?.impressions ?? 0)}
          </p>
        </article>
        <article className="border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Ecoutes</p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {formatInteger(analyticsSummary?.plays ?? 0)}
          </p>
        </article>
        <article className="border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Clic licence</p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {formatPercent(analyticsSummary?.licenseClickRate ?? 0)}
          </p>
        </article>
        <article className="border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Conversion</p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {formatPercent(analyticsSummary?.conversionRate ?? 0)}
          </p>
        </article>
      </section>

      <section className="mt-4 border border-border bg-card p-5">
        <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-foreground">A traiter</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Offres exclusives, promotions actives et signaux faibles a surveiller.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
            <span className="border border-border px-3 py-2">
              <strong className="block text-base text-foreground">{pendingExclusiveOffers.length}</strong>
              offres
            </span>
            <span className="border border-border px-3 py-2">
              <strong className="block text-base text-foreground">{activePromotions.length}</strong>
              promos
            </span>
            <span className="border border-border px-3 py-2">
              <strong className="block text-base text-foreground">{underperformingBeats.length}</strong>
              a optimiser
            </span>
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div>
            <h3 className="text-sm font-medium text-foreground">Offres exclusives</h3>
            <div className="mt-3 grid gap-2">
              {pendingExclusiveOffers.slice(0, 3).map((offer) => (
                <div className="border border-border p-3 text-sm" key={offer.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{offer.beat.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {offer.buyer.displayName ?? "Acheteur"} - {exclusiveOfferStatusLabel(offer.status)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      {formatMoney(offer.acceptedAmount ?? offer.counterAmount ?? offer.proposedAmount, offer.currency)}
                    </span>
                  </div>
                </div>
              ))}
              {pendingExclusiveOffers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune offre exclusive en attente.</p>
              ) : null}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">Promotions</h3>
            <div className="mt-3 grid gap-2">
              {activePromotions.slice(0, 3).map((promotion) => (
                <div className="border border-border p-3 text-sm" key={promotion.id}>
                  <p className="font-medium text-foreground">{promotion.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {promotionDiscountLabel(promotion)} - {promotion.usageCount}
                    {promotion.usageLimit ? `/${promotion.usageLimit}` : ""} usages
                  </p>
                </div>
              ))}
              {activePromotions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune promotion active.</p>
              ) : null}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">A optimiser</h3>
            <div className="mt-3 grid gap-2">
              {underperformingBeats.map((beat) => (
                <div className="border border-border p-3 text-sm" key={beat.id}>
                  <p className="font-medium text-foreground">{beat.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatInteger(beat.impressions)} impressions - {formatPercent(beat.conversionRate)} conversion
                  </p>
                </div>
              ))}
              {underperformingBeats.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun signal faible significatif.</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-4 border border-border bg-card p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              {payoutStatusLabel(summary?.payoutEligibility?.reason)}
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Tu peux publier et vendre maintenant. Les revenus restent comptabilises ici; le retrait
              demande une identite verifiee et un compte payout pret.
            </p>
          </div>
          <span className="inline-flex w-fit border border-border px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {summary?.payoutEligibility?.canReceivePayouts ? "Payout ready" : "Payout bloque"}
          </span>
        </div>
      </section>

      {sales.length === 0 && !error ? (
        <div className="mt-8 border border-dashed border-border p-8">
          <h2 className="text-xl font-semibold text-foreground">Aucune vente</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Les achats payes par tes clients apparaitront ici.
          </p>
          <Link className={`mt-5 ${secondaryButtonClass}`} href={PAGE_PATHS.beats.catalog.getHref()}>
            Voir le catalogue
          </Link>
        </div>
      ) : null}

      <section className="mt-8">
        <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Mes instrus</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Suis la visibilite, le prix et les ventes de chaque publication.
            </p>
          </div>
          <Link className={secondaryButtonClass} href={PAGE_PATHS.beats.catalog.getHref()}>
            Gerer le catalogue
          </Link>
        </div>

        {beats.length === 0 && !error ? (
          <div className="mt-5 border border-dashed border-border p-8">
            <h3 className="text-xl font-semibold text-foreground">Aucune instru</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Publie ta premiere instrumentale pour commencer a vendre.
            </p>
            <Link className={`mt-5 ${secondaryButtonClass}`} href={PAGE_PATHS.beats.catalog.getHref()}>
              Ajouter une instru
            </Link>
          </div>
        ) : null}

        {performanceRows.length > 0 ? (
          <div className="mt-5 overflow-x-auto border border-border bg-card">
            <table className="min-w-[920px] w-full border-collapse text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Instru</th>
                  <th className="px-4 py-3 font-medium">Prix</th>
                  <th className="px-4 py-3 font-medium">Ventes</th>
                  <th className="px-4 py-3 font-medium">Impressions</th>
                  <th className="px-4 py-3 font-medium">Ecoutes</th>
                  <th className="px-4 py-3 font-medium">Clic licence</th>
                  <th className="px-4 py-3 font-medium">Conversion</th>
                  <th className="px-4 py-3 font-medium">Revenu</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {performanceRows.map((beat) => (
                  <tr className="border-b border-border last:border-b-0" key={beat.id}>
                    <td className="px-4 py-4">
                      <p className="font-medium text-foreground">{beat.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {beatStatusLabel(beat.status)} - {beat.visibility} - maj {formatDate(beat.updatedAt)}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">
                      {beat.priceAmount === null ? "Non renseigne" : formatMoney(beat.priceAmount, beat.currency)}
                    </td>
                    <td className="px-4 py-4 text-muted-foreground">{formatInteger(beat.paidSalesCount)}</td>
                    <td className="px-4 py-4 text-muted-foreground">{formatInteger(beat.impressions)}</td>
                    <td className="px-4 py-4 text-muted-foreground">{formatInteger(beat.plays)}</td>
                    <td className="px-4 py-4 text-muted-foreground">{formatInteger(beat.licenseClicks)}</td>
                    <td className="px-4 py-4 text-muted-foreground">{formatPercent(beat.conversionRate)}</td>
                    <td className="px-4 py-4 font-medium text-foreground">
                      {formatMoney(beat.revenue, beat.currency)}
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        className="inline-flex text-sm font-medium text-foreground hover:text-muted-foreground"
                        href={PAGE_PATHS.beats.detail.getHref(beat.slug)}
                      >
                        Ouvrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {sales.length > 0 ? (
        <section className="mt-8">
          <div className="border-b border-border pb-4">
            <h2 className="text-2xl font-semibold text-foreground">Historique des ventes</h2>
          </div>
          <div className="mt-5 grid gap-4">
          {sales.map((sale) => (
            <article className="border border-border bg-card p-5" key={sale.id}>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">{sale.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Licence {sale.licenseName ?? "Non renseignee"} - quantite {sale.quantity}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Commande {sale.orderId} - creee le {formatDate(sale.createdAt)}
                  </p>
                  {sale.beat ? (
                    <Link
                      className="mt-3 inline-flex text-sm font-medium text-foreground hover:text-muted-foreground"
                      href={PAGE_PATHS.beats.detail.getHref(sale.beat.slug)}
                    >
                      Ouvrir la fiche
                    </Link>
                  ) : null}
                </div>
                <dl className="grid min-w-48 gap-1 text-sm text-muted-foreground">
                  <div className="flex justify-between gap-8">
                    <dt>Statut</dt>
                    <dd>{sale.orderStatus}</dd>
                  </div>
                  <div className="flex justify-between gap-8">
                    <dt>Paiement</dt>
                    <dd>{sale.paymentStatus ?? "Non renseigne"}</dd>
                  </div>
                  <div className="flex justify-between gap-8">
                    <dt>Payee le</dt>
                    <dd>{formatDate(sale.paidAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-8 font-semibold text-foreground">
                    <dt>Total</dt>
                    <dd>{formatMoney(sale.lineTotalAmount, sale.currency)}</dd>
                  </div>
                </dl>
              </div>
            </article>
          ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
