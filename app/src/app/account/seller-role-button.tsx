"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SellerRoleButtonProps = {
  isSeller: boolean;
};

/**
 * Active le role vendeur self-service depuis le tableau de bord.
 * @param props.isSeller Etat courant du role vendeur.
 * @returns Bouton d'activation du role vendeur.
 */
export function SellerRoleButton({ isSeller }: SellerRoleButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/account/me/roles", {
        body: JSON.stringify({ roles: ["BUYER", "SELLER"] }),
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        method: "PUT",
      });

      if (!response.ok) {
        throw new Error("Impossible d'activer le role vendeur.");
      }

      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Impossible d'activer le role vendeur.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="border border-black/10 bg-white p-5">
      <h3 className="font-semibold text-black">Role vendeur</h3>
      <p className="mt-2 text-sm leading-6 text-black/60">
        Ajoute le role vendeur a ton compte pour publier et suivre tes ventes.
      </p>
      <button
        className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-black px-4 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:bg-black/30"
        disabled={isSeller || isSubmitting}
        onClick={() => void handleClick()}
        type="button"
      >
        {isSeller ? "Role vendeur actif" : isSubmitting ? "Activation..." : "Activer vendeur"}
      </button>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
