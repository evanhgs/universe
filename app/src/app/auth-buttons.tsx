"use client";

import { SignInButton, useAuth, useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type HeaderAccount = {
  profile: {
    displayName: string;
    slug: string;
  };
  roles: string[];
};

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
 * Construit les initiales a afficher quand Clerk ne fournit pas d'image.
 * @param label Nom public ou adresse email de l'utilisateur.
 * @returns Deux initiales au maximum.
 */
function initialsFor(label: string) {
  const initials = label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "U";
}

/**
 * Affiche le menu profil Universe pour une session connectee.
 * Clerk reste utilise pour les actions sensibles: profil auth, securite et deconnexion.
 * @returns Menu profil personnalise du header.
 */
export function SignedInActions() {
  const { getToken } = useAuth();
  const { openUserProfile, signOut } = useClerk();
  const { user } = useUser();
  const menuRef = useRef<HTMLDivElement>(null);
  const [account, setAccount] = useState<HeaderAccount | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const displayName =
    account?.profile.displayName ??
    user?.fullName ??
    user?.primaryEmailAddress?.emailAddress ??
    "Profil";
  const publicProfileHref = account?.profile.slug
    ? `/profiles/${account.profile.slug}`
    : "/account";
  const isSeller = account?.roles.includes("SELLER") ?? false;

  useEffect(() => {
    let isCancelled = false;

    /**
     * Charge le profil local apres hydratation Clerk pour personnaliser le header.
     */
    async function run() {
      const token = await getToken();
      const headers = new Headers({ Accept: "application/json" });

      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      const response = await fetch("/api/account/me", {
        credentials: "same-origin",
        headers,
      });

      if (!isCancelled && response.ok) {
        setAccount((await response.json()) as HeaderAccount);
      }
    }

    void run();

    return () => {
      isCancelled = true;
    };
  }, [getToken]);

  useEffect(() => {
    let isCancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    /**
     * Charge le compteur de messages non lus pour le badge in-app.
     */
    async function refreshUnreadCount() {
      try {
        const token = await getToken();
        const response = await fetch("/api/chat/unread-count", {
          credentials: "same-origin",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (!isCancelled && response.ok) {
          const payload = (await response.json()) as { unreadCount?: unknown };
          setUnreadCount(
            typeof payload.unreadCount === "number" ? payload.unreadCount : 0,
          );
        }
      } catch {
        if (!isCancelled) {
          setUnreadCount(0);
        }
      }
    }

    void refreshUnreadCount();
    intervalId = setInterval(() => void refreshUnreadCount(), 30000);

    return () => {
      isCancelled = true;

      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [getToken]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    /**
     * Ferme le menu quand l'utilisateur clique hors du composant.
     */
    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    /**
     * Permet de quitter le menu au clavier.
     */
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="relative flex h-10 items-center gap-3 rounded-full border border-black/10 bg-white px-2 pr-4 text-left shadow-sm transition hover:border-black/25"
        onClick={() => setIsOpen((value) => !value)}
        type="button"
      >
        {user?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="h-8 w-8 rounded-full object-cover"
            src={user.imageUrl}
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-xs font-semibold text-white">
            {initialsFor(displayName)}
          </span>
        )}
        <span className="hidden max-w-36 truncate text-sm font-medium text-black md:block">
          {displayName}
        </span>
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-black px-1.5 py-0.5 text-center text-[10px] font-semibold text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          className="absolute right-0 z-20 mt-3 w-72 border border-black/10 bg-white p-2 shadow-xl"
          role="menu"
        >
          <div className="border-b border-black/10 px-3 py-3">
            <p className="truncate text-sm font-semibold text-black">{displayName}</p>
            <p className="mt-1 truncate text-xs text-black/50">
              {user?.primaryEmailAddress?.emailAddress ?? "Compte Universe"}
            </p>
          </div>

          <div className="grid py-2 text-sm">
            <Link
              className="px-3 py-2 text-black hover:bg-black/[0.04]"
              href="/account"
              onClick={() => setIsOpen(false)}
              role="menuitem"
            >
              Tableau de bord
            </Link>
            <Link
              className="px-3 py-2 text-black hover:bg-black/[0.04]"
              href="/account/profile"
              onClick={() => setIsOpen(false)}
              role="menuitem"
            >
              Modifier mon profil
            </Link>
            <Link
              className="px-3 py-2 text-black hover:bg-black/[0.04]"
              href={publicProfileHref}
              onClick={() => setIsOpen(false)}
              role="menuitem"
            >
              Voir mon profil public
            </Link>
            <Link
              className="px-3 py-2 text-black hover:bg-black/[0.04]"
              href="/account/messages"
              onClick={() => setIsOpen(false)}
              role="menuitem"
            >
              <span className="flex items-center justify-between gap-3">
                <span>Messages</span>
                {unreadCount > 0 ? (
                  <span className="min-w-6 rounded-full bg-black px-2 py-0.5 text-center text-xs font-semibold text-white">
                    {unreadCount}
                  </span>
                ) : null}
              </span>
            </Link>
            <Link
              className="px-3 py-2 text-black hover:bg-black/[0.04]"
              href="/account/purchases"
              onClick={() => setIsOpen(false)}
              role="menuitem"
            >
              Mes achats
            </Link>
            {isSeller ? (
              <Link
                className="px-3 py-2 text-black hover:bg-black/[0.04]"
                href="/account/sales"
                onClick={() => setIsOpen(false)}
                role="menuitem"
              >
                Mes ventes
              </Link>
            ) : null}
          </div>

          <div className="grid border-t border-black/10 py-2 text-sm">
            <button
              className="px-3 py-2 text-left text-black hover:bg-black/[0.04]"
              onClick={() => {
                setIsOpen(false);
                openUserProfile();
              }}
              role="menuitem"
              type="button"
            >
              Parametres Clerk
            </button>
            <button
              className="px-3 py-2 text-left text-black hover:bg-black/[0.04]"
              onClick={() => void signOut({ redirectUrl: "/" })}
              role="menuitem"
              type="button"
            >
              Se deconnecter
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
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
