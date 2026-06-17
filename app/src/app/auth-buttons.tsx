"use client";

import { SignInButton, useAuth, useClerk, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { API_PATHS, PAGE_PATHS } from "@/lib/paths";
import { cn } from "@/lib/utils";

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
      <Button onClick={() => openSignUp()} type="button">
        Sign up
      </Button>
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
    ? PAGE_PATHS.profiles.detail.getHref(account.profile.slug)
    : PAGE_PATHS.account.dashboard.getHref();

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

      const response = await fetch(API_PATHS.account.me(), {
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
        const response = await fetch(API_PATHS.chat.unreadCount(), {
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

  const menuItemClass =
    "rounded-md px-3 py-2 text-foreground outline-none transition hover:bg-accent/12 focus:bg-accent/12";

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className="relative flex h-10 items-center gap-3 rounded-full border border-border bg-card px-2 pr-4 text-left shadow-sm outline-none transition hover:border-ring/60 focus-visible:ring-[3px] focus-visible:ring-ring/25"
        onClick={() => setIsOpen((value) => !value)}
        type="button"
      >
        <Avatar>
          {user?.imageUrl ? <AvatarImage alt="" src={user.imageUrl} /> : null}
          <AvatarFallback>
            {initialsFor(displayName)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-36 truncate text-sm font-medium text-foreground md:block">
          {displayName}
        </span>
        {unreadCount > 0 ? (
          <Badge className="absolute -right-1 -top-1 min-w-5 justify-center px-1.5 py-0 text-[10px]" variant="primary">
            {unreadCount}
          </Badge>
        ) : null}
      </button>

      {isOpen ? (
        <div
          className="absolute right-0 z-20 mt-3 w-72 rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-xl"
          role="menu"
        >
          <div className="border-b border-border px-3 py-3">
            <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {user?.primaryEmailAddress?.emailAddress ?? "Compte Universe"}
            </p>
          </div>

          <div className="grid py-2 text-sm">
            <Link
              className={menuItemClass}
              href={PAGE_PATHS.account.dashboard.getHref()}
              onClick={() => setIsOpen(false)}
              role="menuitem"
            >
              Dashboard
            </Link>
            <Link
              className={menuItemClass}
              href={PAGE_PATHS.account.messages.getHref()}
              onClick={() => setIsOpen(false)}
              role="menuitem"
            >
              <span className="flex items-center justify-between gap-3">
                <span>Messagerie</span>
                {unreadCount > 0 ? (
                  <Badge className="min-w-6 justify-center px-2 py-0 text-xs" variant="primary">
                    {unreadCount}
                  </Badge>
                ) : null}
              </span>
            </Link>
            <Link
              className={menuItemClass}
              href={PAGE_PATHS.account.purchases.getHref()}
              onClick={() => setIsOpen(false)}
              role="menuitem"
            >
              Mes achats
            </Link>
            <Link
                className={menuItemClass}
                href={PAGE_PATHS.account.sales.getHref()}
                onClick={() => setIsOpen(false)}
                role="menuitem"
              >
                Mes ventes
              </Link>
          </div>

          <div className="grid border-t border-border py-2 text-sm">
            <button
              className={cn(menuItemClass, "text-left")}
              onClick={() => {
                setIsOpen(false);
                openUserProfile();
              }}
              role="menuitem"
              type="button"
            >
              Paramètres
            </button>
            <button
              className={cn(menuItemClass, "text-left")}
              onClick={() => void signOut({ redirectUrl: "/" })}
              role="menuitem"
              type="button"
            >
              Se déconnecter
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
