"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type PortalPayload = {
  portalUrl?: string;
  error?: string;
};

async function readPortalResponse(response: Response) {
  const payload = (await response.json()) as PortalPayload;

  if (!response.ok) {
    throw new Error(payload.error ?? "subscription_portal_failed");
  }

  if (!payload.portalUrl) {
    throw new Error("stripe_portal_url_missing");
  }

  return payload.portalUrl;
}

export function SubscriptionPortalButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setLoading(true);
    setError(null);

    try {
      const portalUrl = await readPortalResponse(
        await fetch("/api/subscriptions/portal/stripe", {
          method: "POST",
          headers: {
            Accept: "application/json",
          },
        }),
      );

      window.location.assign(portalUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "subscription_portal_failed");
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-3">
      <Button disabled={loading} onClick={() => void openPortal()} type="button">
        {loading ? "Ouverture Stripe..." : "Gérer mon abonnement"}
      </Button>
      {error ? <Alert variant="destructive">{error}</Alert> : null}
    </div>
  );
}
