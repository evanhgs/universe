"use client";

import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type OrderStatus =
  | "DRAFT"
  | "PENDING_PAYMENT"
  | "PAID"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "FAILED"
  | "CANCELLED";

type EntitlementStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

type PurchaseOrder = {
  id: string;
  status: OrderStatus;
  currency: string;
  subtotalAmount: number;
  commissionAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAt: string | null;
  createdAt: string;
  items: Array<{
    id: string;
    beatLicenseOfferingId: string | null;
    title: string;
    licenseName: string | null;
    unitAmount: number;
    lineTotalAmount: number;
    beat: {
      slug: string;
      title: string;
    } | null;
    seller: {
      slug: string | null;
      displayName: string | null;
    } | null;
  }>;
  payments?: Array<{
    id: string;
    provider: string;
    status: string;
    amount: number;
    currency: string;
    paidAt: string | null;
  }>;
  entitlements?: Array<{
    id: string;
    status: EntitlementStatus;
    beatLicenseOfferingId: string | null;
    downloadLimit: number | null;
    downloadCount: number;
    accessGrantedAt: string | null;
    expiresAt: string | null;
  }>;
};

type PurchasesResponse = {
  items: PurchaseOrder[];
  count: number;
};

type DownloadResponse = {
  download: {
    asset: {
      url: string;
      expiresIn: number;
      originalFilename: string | null;
    };
  };
};

type JsonBody = {
  error?: unknown;
  message?: unknown;
};

const buttonClass =
  "inline-flex h-10 items-center justify-center rounded-full bg-black px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-black/35";
const secondaryButtonClass =
  "inline-flex h-10 items-center justify-center rounded-full border border-black/15 px-4 text-sm font-medium text-black disabled:cursor-not-allowed disabled:text-black/35";

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "Non renseigne";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

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

function statusLabel(status: OrderStatus) {
  switch (status) {
    case "PAID":
      return "Payee";
    case "PENDING_PAYMENT":
      return "Paiement en attente";
    case "FAILED":
      return "Echec";
    case "CANCELLED":
      return "Annulee";
    case "REFUNDED":
      return "Remboursee";
    case "PARTIALLY_REFUNDED":
      return "Remboursement partiel";
    default:
      return status;
  }
}

function findEntitlement(
  order: PurchaseOrder,
  item: PurchaseOrder["items"][number],
) {
  const entitlements = order.entitlements ?? [];

  return (
    entitlements.find(
      (entitlement) =>
        entitlement.beatLicenseOfferingId !== null &&
        entitlement.beatLicenseOfferingId === item.beatLicenseOfferingId,
    ) ?? (order.items.length === 1 ? entitlements[0] : undefined)
  );
}

function errorMessage(error: string) {
  if (error === "stripe_session_not_paid") {
    return "Stripe n a pas encore confirme le paiement.";
  }

  if (error === "download_limit_reached") {
    return "La limite de telechargement est atteinte.";
  }

  if (error === "entitlement_expired") {
    return "L acces a ce fichier a expire.";
  }

  if (error === "download_asset_not_found") {
    return "Le fichier de cette licence est indisponible.";
  }

  if (error === "unauthorized" || error === "HTTP 401") {
    return "Ta session n est pas reconnue par l API. Reconnecte-toi puis recharge cette page.";
  }

  return error;
}

export function PurchasesClient() {
  const { openSignIn } = useClerk();
  const { getToken } = useAuth();
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");
  const stripeSessionId = searchParams.get("stripeSessionId");
  const checkout = searchParams.get("checkout");
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buildAuthHeaders = useCallback(async (base: HeadersInit = {}) => {
    const headers = new Headers(base);
    const token = await getToken();

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    return headers;
  }, [getToken]);

  const loadPurchases = useCallback(async () => {
    const response = await readJsonResponse<PurchasesResponse>(
      await fetch("/api/marketplace/purchases", {
        credentials: "same-origin",
        headers: await buildAuthHeaders({
          Accept: "application/json",
        }),
      }),
    );

    setOrders(response.items);
  }, [buildAuthHeaders]);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    let isCancelled = false;

    async function run() {
      setIsLoading(true);
      setError(null);
      setNotice(checkout === "cancelled" ? "Paiement annule." : null);

      try {
        if (orderId && stripeSessionId) {
          await readJsonResponse<PurchaseOrder>(
            await fetch(`/api/marketplace/orders/${orderId}/payments/stripe/confirm`, {
              method: "POST",
              credentials: "same-origin",
              headers: await buildAuthHeaders({
                Accept: "application/json",
                "Content-Type": "application/json",
              }),
              body: JSON.stringify({ sessionId: stripeSessionId }),
            }),
          );

          if (!isCancelled) {
            setNotice("Paiement confirme. Ton telechargement est disponible.");
            router.replace("/account/purchases", { scroll: false });
          }
        }

        if (isSignedIn) {
          await loadPurchases();
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
  }, [buildAuthHeaders, checkout, isLoaded, isSignedIn, loadPurchases, orderId, router, stripeSessionId]);

  async function download(entitlementId: string) {
    setDownloadingId(entitlementId);
    setError(null);

    try {
      const response = await readJsonResponse<DownloadResponse>(
        await fetch(`/api/marketplace/downloads/${entitlementId}`, {
          credentials: "same-origin",
          headers: await buildAuthHeaders({
            Accept: "application/json",
          }),
        }),
      );
      const opened = window.open(response.download.asset.url, "_blank", "noopener,noreferrer");

      if (!opened) {
        window.location.assign(response.download.asset.url);
      }

      await loadPurchases();
    } catch (err) {
      setError(errorMessage(err instanceof Error ? err.message : "Erreur inconnue."));
    } finally {
      setDownloadingId(null);
    }
  }

  if (!isLoaded || isLoading) {
    return (
      <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-5xl px-6 py-10">
        <p className="text-sm text-black/60">Chargement des achats...</p>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-5xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight text-black">Mes achats</h1>
        <p className="mt-3 text-sm leading-6 text-black/60">
          Connecte-toi pour consulter tes licences et telecharger tes fichiers.
        </p>
        {notice ? (
          <p className="mt-6 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="mt-6 border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </p>
        ) : null}
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
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-black">Mes achats</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">
          Retrouve tes licences payees et genere un lien de telechargement securise.
        </p>
      </div>

      {notice ? (
        <p className="mt-6 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mt-6 border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </p>
      ) : null}

      {orders.length === 0 ? (
        <div className="mt-8 border border-dashed border-black/20 p-8">
          <h2 className="text-xl font-semibold text-black">Aucun achat</h2>
          <p className="mt-2 text-sm leading-6 text-black/60">
            Les licences achetees apparaitront ici apres paiement valide.
          </p>
          <Link className={`mt-5 ${secondaryButtonClass}`} href="/beats">
            Voir le catalogue
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-4">
          {orders.map((order) => (
            <article className="border border-black/10 bg-white p-5" key={order.id}>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-black">{statusLabel(order.status)}</p>
                  <p className="mt-1 text-xs text-black/45">
                    Commande {order.id} - creee le {formatDate(order.createdAt)}
                  </p>
                  {order.paidAt ? (
                    <p className="mt-1 text-xs text-black/45">
                      Payee le {formatDate(order.paidAt)}
                    </p>
                  ) : null}
                </div>
                <dl className="grid gap-1 text-sm text-black/65">
                  <div className="flex justify-between gap-8">
                    <dt>HT</dt>
                    <dd>{formatMoney(order.subtotalAmount, order.currency)}</dd>
                  </div>
                  <div className="flex justify-between gap-8">
                    <dt>Taxe</dt>
                    <dd>{formatMoney(order.taxAmount, order.currency)}</dd>
                  </div>
                  <div className="flex justify-between gap-8 font-semibold text-black">
                    <dt>TTC</dt>
                    <dd>{formatMoney(order.totalAmount, order.currency)}</dd>
                  </div>
                </dl>
              </div>

              <div className="mt-5 grid gap-3">
                {order.items.map((item) => {
                  const entitlement = findEntitlement(order, item);
                  const canDownload =
                    order.status === "PAID" && entitlement?.status === "ACTIVE";

                  return (
                    <div className="border border-black/10 p-4" key={item.id}>
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <h2 className="text-lg font-semibold text-black">{item.title}</h2>
                          <p className="mt-1 text-sm text-black/60">
                            Licence {item.licenseName ?? "Non renseignee"} -{" "}
                            {formatMoney(item.lineTotalAmount, order.currency)} HT
                          </p>
                          {item.beat?.slug ? (
                            <Link
                              className="mt-2 inline-flex text-sm font-medium text-black hover:text-black/65"
                              href={`/beats/${item.beat.slug}`}
                            >
                              Ouvrir la fiche
                            </Link>
                          ) : null}
                        </div>
                        <div className="text-sm text-black/55">
                          {entitlement ? (
                            <>
                              <p>
                                Telechargements: {entitlement.downloadCount}
                                {entitlement.downloadLimit === null
                                  ? ""
                                  : `/${entitlement.downloadLimit}`}
                              </p>
                              <p>Acces: {entitlement.status}</p>
                            </>
                          ) : (
                            <p>Acces en attente du paiement.</p>
                          )}
                        </div>
                      </div>
                      <button
                        className={`mt-4 ${buttonClass}`}
                        disabled={!canDownload || downloadingId === entitlement?.id}
                        onClick={() => entitlement && void download(entitlement.id)}
                        type="button"
                      >
                        {downloadingId === entitlement?.id
                          ? "Generation du lien..."
                          : "Telecharger"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
