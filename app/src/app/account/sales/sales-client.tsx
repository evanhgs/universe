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
};

type JsonBody = {
  error?: unknown;
  message?: unknown;
};

const buttonClass =
  "inline-flex h-10 items-center justify-center rounded-full bg-black px-4 text-sm font-medium text-white";
const secondaryButtonClass =
  "inline-flex h-10 items-center justify-center rounded-full border border-black/15 px-4 text-sm font-medium text-black";

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
 * Liste les lignes de commandes vendues par l'utilisateur connecte.
 * @returns Interface vendeur simple pour la V1.
 */
export function SalesClient() {
  const { openSignIn } = useClerk();
  const { getToken } = useAuth();
  const { isLoaded, isSignedIn } = useUser();
  const [sales, setSales] = useState<SaleItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPaid = useMemo(
    () =>
      sales
        .filter((sale) => sale.orderStatus === "PAID")
        .reduce((sum, sale) => sum + sale.lineTotalAmount, 0),
    [sales],
  );
  const currency = sales[0]?.currency ?? "EUR";

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
        <p className="text-sm text-black/60">Chargement des ventes...</p>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-5xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight text-black">Mes ventes</h1>
        <p className="mt-3 text-sm leading-6 text-black/60">
          Connecte-toi pour consulter ton historique vendeur.
        </p>
        <button className={`mt-6 ${buttonClass}`} onClick={() => openSignIn()} type="button">
          Se connecter
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-5xl px-6 py-10">
      <div className="border-b border-black/10 pb-8">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-black/45">
          Marketplace
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-black">Mes ventes</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">
          Consulte les commandes contenant tes instrumentales et suis le revenu brut paye.
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

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <article className="border border-black/10 bg-white p-5">
          <p className="text-sm text-black/45">Ventes payees</p>
          <p className="mt-2 text-3xl font-semibold text-black">
            {sales.filter((sale) => sale.orderStatus === "PAID").length}
          </p>
        </article>
        <article className="border border-black/10 bg-white p-5">
          <p className="text-sm text-black/45">Revenu brut</p>
          <p className="mt-2 text-3xl font-semibold text-black">
            {formatMoney(totalPaid, currency)}
          </p>
        </article>
        <article className="border border-black/10 bg-white p-5">
          <p className="text-sm text-black/45">Lignes de commande</p>
          <p className="mt-2 text-3xl font-semibold text-black">{sales.length}</p>
        </article>
      </section>

      {sales.length === 0 && !error ? (
        <div className="mt-8 border border-dashed border-black/20 p-8">
          <h2 className="text-xl font-semibold text-black">Aucune vente</h2>
          <p className="mt-2 text-sm leading-6 text-black/60">
            Les achats payes par tes clients apparaitront ici.
          </p>
          <Link className={`mt-5 ${secondaryButtonClass}`} href="/beats">
            Voir le catalogue
          </Link>
        </div>
      ) : null}

      {sales.length > 0 ? (
        <div className="mt-8 grid gap-4">
          {sales.map((sale) => (
            <article className="border border-black/10 bg-white p-5" key={sale.id}>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-black">{sale.title}</h2>
                  <p className="mt-1 text-sm text-black/60">
                    Licence {sale.licenseName ?? "Non renseignee"} - quantite {sale.quantity}
                  </p>
                  <p className="mt-1 text-xs text-black/45">
                    Commande {sale.orderId} - creee le {formatDate(sale.createdAt)}
                  </p>
                  {sale.beat ? (
                    <Link
                      className="mt-3 inline-flex text-sm font-medium text-black hover:text-black/65"
                      href={`/beats/${sale.beat.slug}`}
                    >
                      Ouvrir la fiche
                    </Link>
                  ) : null}
                </div>
                <dl className="grid min-w-48 gap-1 text-sm text-black/65">
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
                  <div className="flex justify-between gap-8 font-semibold text-black">
                    <dt>Total</dt>
                    <dd>{formatMoney(sale.lineTotalAmount, sale.currency)}</dd>
                  </div>
                </dl>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </main>
  );
}
