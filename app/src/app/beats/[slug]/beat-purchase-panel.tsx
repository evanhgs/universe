"use client";

import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { useState } from "react";

type LicenseOffering = {
  id: string;
  title: string;
  description: string | null;
  scope: string;
  priceAmount: number;
  currency: string;
};

type OrderPayload = {
  id: string;
};

type StripeCheckoutPayload = {
  checkoutUrl: string;
};

type JsonBody = {
  error?: unknown;
  message?: unknown;
};

type BeatPurchasePanelProps = {
  beatSlug: string;
  isOwner: boolean;
  checkoutCancelled: boolean;
  licenseOfferings: LicenseOffering[];
};

/**
 * Formate le prix hors taxe d'une offre de licence.
 * @param priceAmount Montant decimal de l'offre.
 * @param currency Code devise ISO.
 */
function formatPriceHT(priceAmount: number, currency: string) {
  if (priceAmount === 0) {
    return "Gratuit";
  }

  return `${new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
  }).format(priceAmount)} HT`;
}

/**
 * Parse une reponse JSON fetch et leve une erreur lisible si le statut HTTP echoue.
 * @param response Reponse HTTP a lire.
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
 * Traduit une erreur API d'achat en message utilisateur.
 * @param error Code ou message brut.
 */
function userMessage(error: string) {
  if (error === "already_purchased") {
    return "Tu as deja achete cette licence. Retrouve-la dans Mes achats.";
  }

  if (error === "cannot_buy_own_beat") {
    return "Tu ne peux pas acheter ta propre instrumentale.";
  }

  if (error === "stripe_not_configured") {
    return "Stripe n est pas encore configure sur cet environnement.";
  }

  if (error === "unauthorized" || error === "HTTP 401") {
    return "Ta session n est pas reconnue par l API. Reconnecte-toi puis relance l achat.";
  }

  return error;
}

/**
 * Affiche les offres de licence d'un beat et demarre le checkout Stripe.
 * @param props Beat cible, statut proprietaire et offres disponibles.
 */
export function BeatPurchasePanel({
  beatSlug,
  isOwner,
  checkoutCancelled,
  licenseOfferings,
}: BeatPurchasePanelProps) {
  const { openSignIn } = useClerk();
  const { getToken } = useAuth();
  const { isLoaded, isSignedIn } = useUser();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Cree la commande puis redirige vers Stripe Checkout.
   * @param licenseOfferingId Identifiant de l'offre de licence choisie.
   */
  async function startPurchase(licenseOfferingId: string) {
    setError(null);

    if (!isLoaded) {
      return;
    }

    if (!isSignedIn) {
      openSignIn();
      return;
    }

    setLoadingId(licenseOfferingId);

    try {
      const token = await getToken();
      const headers = new Headers({
        Accept: "application/json",
        "Content-Type": "application/json",
      });

      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      const order = await readJsonResponse<OrderPayload>(
        await fetch("/api/marketplace/orders", {
          method: "POST",
          credentials: "same-origin",
          headers,
          body: JSON.stringify({ licenseOfferingId }),
        }),
      );

      const checkout = await readJsonResponse<StripeCheckoutPayload>(
        await fetch(`/api/marketplace/orders/${order.id}/checkout/stripe`, {
          method: "POST",
          credentials: "same-origin",
          headers,
          body: JSON.stringify({
            successUrl: `${window.location.origin}/account/purchases?orderId=${order.id}&stripeSessionId={CHECKOUT_SESSION_ID}`,
            cancelUrl: `${window.location.origin}/beats/${beatSlug}?checkout=cancelled`,
          }),
        }),
      );

      window.location.assign(checkout.checkoutUrl);
    } catch (err) {
      setError(userMessage(err instanceof Error ? err.message : "Erreur inconnue."));
      setLoadingId(null);
    }
  }

  return (
    <div className="mt-6 border-t border-black/10 pt-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-black">Licences</p>
          <p className="mt-1 text-sm leading-6 text-black/60">
            Choisis une licence. Le prix TTC est calcule et affiche dans Stripe avant paiement.
          </p>
        </div>
      </div>

      {checkoutCancelled ? (
        <p className="mt-4 border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          Paiement annule. Tu peux choisir une licence et relancer le paiement.
        </p>
      ) : null}

      {licenseOfferings.length === 0 ? (
        <p className="mt-4 border border-dashed border-black/20 p-4 text-sm text-black/60">
          Aucune licence active pour cette instrumentale.
        </p>
      ) : (
        <div className="mt-4 grid gap-3">
          {licenseOfferings.map((offering) => {
            const isLoading = loadingId === offering.id;
            const disabled = isOwner || Boolean(loadingId);

            return (
              <article className="border border-black/10 p-4" key={offering.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold text-black">{offering.title}</h2>
                    <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-black/40">
                      {offering.scope}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-black">
                    {formatPriceHT(offering.priceAmount, offering.currency)}
                  </p>
                </div>
                {offering.description ? (
                  <p className="mt-3 text-sm leading-6 text-black/60">{offering.description}</p>
                ) : null}
                <button
                  className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-full bg-black px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-black/35"
                  disabled={disabled}
                  onClick={() => void startPurchase(offering.id)}
                  type="button"
                >
                  {isOwner
                    ? "Indisponible pour le vendeur"
                    : isLoading
                      ? "Redirection Stripe..."
                      : isSignedIn
                        ? "Acheter"
                        : "Se connecter pour acheter"}
                </button>
              </article>
            );
          })}
        </div>
      )}

      {error ? (
        <p className="mt-4 border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
