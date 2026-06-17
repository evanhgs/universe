"use client";

import { SignInButton, useAuth } from "@clerk/nextjs";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { API_PATHS, PAGE_PATHS } from "@/lib/paths";

type RedirectPayload = {
  checkoutUrl?: string;
  portalUrl?: string;
  error?: string;
};

async function readRedirect(response: Response) {
  const payload = (await response.json()) as RedirectPayload;

  if (!response.ok) {
    throw new Error(payload.error ?? "subscription_request_failed");
  }

  return payload;
}

export function PricingActions(props: { isPremium: boolean }) {
  const { isSignedIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function redirectToStripe(path: string, field: "checkoutUrl" | "portalUrl") {
    setLoading(true);
    setError(null);

    try {
      const payload = await readRedirect(
        await fetch(path, {
          method: "POST",
          headers: {
            Accept: "application/json",
          },
        }),
      );
      const url = payload[field];

      if (!url) {
        throw new Error("stripe_redirect_missing");
      }

      window.location.assign(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "subscription_request_failed");
      setLoading(false);
    }
  }

  if (!isSignedIn) {
    return (
      <SignInButton mode="redirect" forceRedirectUrl={PAGE_PATHS.pricing.getHref()}>
        <Button className="w-full" size="lg">
          Activer Universe
        </Button>
      </SignInButton>
    );
  }

  return (
    <div className="space-y-3">
      <Button
        className="w-full"
        disabled={loading}
        onClick={() =>
          props.isPremium
            ? redirectToStripe(API_PATHS.subscriptions.portalStripe(), "portalUrl")
            : redirectToStripe(API_PATHS.subscriptions.checkoutStripe(), "checkoutUrl")
        }
        size="lg"
      >
        {loading
          ? "Ouverture Stripe..."
          : props.isPremium
            ? "Gérer mon abonnement"
            : "Passer à Universe"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
