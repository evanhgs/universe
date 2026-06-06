"use client";

import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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

/**
 * Traduit un statut beat pour un dashboard vendeur lisible.
 * @param status Statut brut Prisma/API.
 */
function beatStatusLabel(status: string) {
  if (status === "PUBLISHED") {
    return "Publiee";
  }

  if (status === "PROCESSING") {
    return "En traitement";
  }

  if (status === "DRAFT") {
    return "Brouillon";
  }

  if (status === "HIDDEN") {
    return "Masquee";
  }

  if (status === "ARCHIVED") {
    return "Archivee";
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
  if (error === "seller_role_required") {
    return "Active le role vendeur dans ton profil pour consulter tes ventes.";
  }

  if (error === "unauthorized" || error === "HTTP 401") {
    return "Connecte-toi pour consulter tes ventes.";
  }

  return error;
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
    return "Verification d'identite requise avant retrait";
  }

  if (reason === "PAYOUT_ACCOUNT_REQUIRED") {
    return "Compte de retrait a configurer";
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
          await fetch("/api/marketplace/sales", {
            credentials: "same-origin",
            headers: await buildAuthHeaders({
              Accept: "application/json",
            }),
          }),
        );

        if (!isCancelled) {
          setSales(response.items);
          setBeats(response.beats ?? []);
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
          {error.includes("vendeur") ? (
            <Link className={`mt-4 ${secondaryButtonClass}`} href="/account/profile">
              Activer vendeur
            </Link>
          ) : null}
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
          <Link className={`mt-5 ${secondaryButtonClass}`} href="/beats">
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
          <Link className={secondaryButtonClass} href="/beats">
            Gerer le catalogue
          </Link>
        </div>

        {beats.length === 0 && !error ? (
          <div className="mt-5 border border-dashed border-border p-8">
            <h3 className="text-xl font-semibold text-foreground">Aucune instru</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Publie ta premiere instrumentale pour commencer a vendre.
            </p>
            <Link className={`mt-5 ${secondaryButtonClass}`} href="/beats">
              Ajouter une instru
            </Link>
          </div>
        ) : null}

        {beats.length > 0 ? (
          <div className="mt-5 grid gap-4">
            {beats.map((beat) => (
              <article className="border border-border bg-card p-5" key={beat.id}>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{beat.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {beatStatusLabel(beat.status)} - {beat.visibility}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Mis a jour le {formatDate(beat.updatedAt)}
                    </p>
                  </div>
                  <dl className="grid min-w-56 gap-1 text-sm text-muted-foreground">
                    <div className="flex justify-between gap-8">
                      <dt>Prix</dt>
                      <dd>
                        {beat.priceAmount === null
                          ? "Non renseigne"
                          : formatMoney(beat.priceAmount, beat.currency)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-8">
                      <dt>Ventes payees</dt>
                      <dd>{beat.paidSalesCount}</dd>
                    </div>
                    <div className="flex justify-between gap-8">
                      <dt>Publiee le</dt>
                      <dd>{formatDate(beat.publishedAt)}</dd>
                    </div>
                  </dl>
                  <Link
                    className="inline-flex text-sm font-medium text-foreground hover:text-muted-foreground"
                    href={`/beats/${beat.slug}`}
                  >
                    Ouvrir
                  </Link>
                </div>
              </article>
            ))}
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
                      href={`/beats/${sale.beat.slug}`}
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
