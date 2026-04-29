"use client";

import { SignInButton, UserButton, useClerk, useUser } from "@clerk/nextjs";

/**
 * Affiche les actions disponibles pour un visiteur non connecte.
 * @returns Boutons Clerk de connexion et inscription.
 */
export function SignedOutActions() {
  const { openSignUp } = useClerk();

  return (
    <>
      <SignInButton />
      <button
        className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white"
        onClick={() => openSignUp()}
        type="button"
      >
        Sign up
      </button>
    </>
  );
}

/**
 * Affiche le menu utilisateur Clerk pour une session connectee.
 * @returns UserButton Clerk.
 */
export function SignedInActions() {
  return <UserButton />;
}

/**
 * Choisit les actions d'authentification selon l'etat Clerk courant.
 * @returns Actions connecte/deconnecte ou null pendant le chargement.
 */
export function AuthActions() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return null;
  }

  return isSignedIn ? <SignedInActions /> : <SignedOutActions />;
}
