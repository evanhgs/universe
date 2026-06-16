"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

import { SubscriptionPortalButton } from "../subscription-portal-button";

type AccountSnapshot = {
  user: {
    email: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
  };
  profile: {
    displayName: string;
    slug: string;
    bio: string | null;
    city: string | null;
    countryCode: string | null;
    isPublic: boolean;
  };
  roles: string[];
};

type ProfileFormProps = {
  initialAccount: AccountSnapshot;
  subscription: {
    isPremium: boolean;
    commissionRateBp: number;
    currentPeriodEnd: string | null;
    canManageSubscription: boolean;
  };
};

type JsonBody = {
  error?: unknown;
  message?: unknown;
};

const helperClass = "mt-1 text-xs leading-5 text-muted-foreground";

/**
 * Lit une reponse JSON et remonte un message exploitable si l'API refuse la requete.
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
 * Formulaire client pour modifier les champs de profil autorises par l'API account.
 * @param props.initialAccount Snapshot charge cote serveur pour eviter un etat vide.
 */
export function ProfileForm({ initialAccount, subscription }: ProfileFormProps) {
  const { getToken } = useAuth();
  const { openUserProfile } = useClerk();
  const router = useRouter();
  const [firstName, setFirstName] = useState(initialAccount.user.firstName ?? "");
  const [lastName, setLastName] = useState(initialAccount.user.lastName ?? "");
  const [username, setUsername] = useState(initialAccount.user.username ?? "");
  const [displayName, setDisplayName] = useState(initialAccount.profile.displayName);
  const [slug, setSlug] = useState(initialAccount.profile.slug);
  const [bio, setBio] = useState(initialAccount.profile.bio ?? "");
  const [city, setCity] = useState(initialAccount.profile.city ?? "");
  const [countryCode, setCountryCode] = useState(initialAccount.profile.countryCode ?? "");
  const [isPublic, setIsPublic] = useState(initialAccount.profile.isPublic);
  const [isSaving, setIsSaving] = useState(false);
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

  /**
   * Sauvegarde le profil Universe puis synchronise les roles self-service.
   */
  async function saveProfile() {
    setIsSaving(true);
    setNotice(null);
    setError(null);

    try {
      const profilePayload = {
        ...(firstName.trim() ? { firstName } : {}),
        ...(lastName.trim() ? { lastName } : {}),
        ...(username.trim() ? { username } : {}),
        displayName,
        slug,
        bio,
        city,
        countryCode,
        isPublic,
      };

      await readJsonResponse<AccountSnapshot>(
        await fetch("/api/account/me/profile", {
          method: "PATCH",
          credentials: "same-origin",
          headers: await buildAuthHeaders({
            Accept: "application/json",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify(profilePayload),
        }),
      );

      await readJsonResponse<{ roles: string[] }>(
        await fetch("/api/account/me/roles", {
          method: "PUT",
          credentials: "same-origin",
          headers: await buildAuthHeaders({
            Accept: "application/json",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            roles: ["BUYER"],
          }),
        }),
      );

      setNotice("Profil mis a jour.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-5xl px-6 py-10">
      <div className="border-b border-border pb-8">
        <p className="text-sm font-medium uppercase text-muted-foreground">
          Profil
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
          Modifier mon profil
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Universe gere les infos publiques du marketplace. Clerk reste ton espace de reference
          pour email, mot de passe, sessions et securite du compte.
        </p>
      </div>

      {notice ? (
        <Alert className="mt-6 font-medium" variant="success">
          {notice}
        </Alert>
      ) : null}
      {error ? (
        <Alert className="mt-6 font-medium" variant="destructive">
          {error}
        </Alert>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card className="p-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Label>
              Prenom
              <Input
                className="mt-2"
                onChange={(event) => setFirstName(event.target.value)}
                value={firstName}
              />
            </Label>
            <Label>
              Nom
              <Input
                className="mt-2"
                onChange={(event) => setLastName(event.target.value)}
                value={lastName}
              />
            </Label>
            <Label>
              Username Clerk
              <Input
                className="mt-2"
                onChange={(event) => setUsername(event.target.value.toLowerCase())}
                value={username}
              />
              <span className={helperClass}>Lettres, chiffres, tirets et underscores.</span>
            </Label>
            <Label>
              Nom public
              <Input
                className="mt-2"
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
            </Label>
            <Label>
              Slug public
              <Input
                className="mt-2"
                onChange={(event) => setSlug(event.target.value.toLowerCase())}
                required
                value={slug}
              />
              <span className={helperClass}>URL publique: /profiles/{slug || "mon-profil"}</span>
            </Label>
            <div className="grid gap-5 md:grid-cols-2">
              <Label>
                Ville
                <Input
                  className="mt-2"
                  onChange={(event) => setCity(event.target.value)}
                  value={city}
                />
              </Label>
              <Label>
                Pays
                <Input
                  className="mt-2"
                  maxLength={2}
                  onChange={(event) => setCountryCode(event.target.value.toUpperCase())}
                  placeholder="FR"
                  value={countryCode}
                />
              </Label>
            </div>
          </div>

          <Label className="mt-5 block">
            Bio
            <Textarea
              className="mt-2 min-h-32 resize-y"
              maxLength={500}
              onChange={(event) => setBio(event.target.value)}
              value={bio}
            />
            <span className={helperClass}>{bio.length}/500 caracteres.</span>
          </Label>

          <div className="mt-6 grid gap-3 border-t border-border pt-5">
            <Label className="flex items-start gap-3 text-sm text-foreground">
              <Switch
                checked={isPublic}
                className="mt-1"
                onCheckedChange={setIsPublic}
              />
              <span>
                Profil public
                <span className="block text-xs leading-5 text-muted-foreground">
                  Si le profil est prive, seul ton compte peut consulter la page publique.
                </span>
              </span>
            </Label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              disabled={isSaving}
              onClick={() => void saveProfile()}
              size="lg"
              type="button"
            >
              {isSaving ? "Enregistrement..." : "Enregistrer"}
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/account">Retour au compte</Link>
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold text-foreground">Abonnement Universe</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {subscription.isPremium
              ? `Universe est actif avec ${subscription.commissionRateBp / 100}% de commission.`
              : `Universe n'est pas actif. La commission actuelle est de ${subscription.commissionRateBp / 100}%.`}
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {"Le portail Stripe permet de gerer le moyen de paiement, la pause si elle est activee dans Stripe, la desactivation et l'annulation."}
          </p>
          <div className="mt-5">
            {subscription.canManageSubscription ? (
              <SubscriptionPortalButton />
            ) : (
              <Button asChild variant="outline">
                <Link href="/pricing">{"Voir l'abonnement"}</Link>
              </Button>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold text-foreground">Parametres Clerk</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Utilise Clerk pour gerer email, mot de passe, sessions actives et les
            controles de securite.
          </p>
          <p className="mt-4 break-all text-sm text-muted-foreground">{initialAccount.user.email}</p>
          <Button
            className="mt-5"
            onClick={() => openUserProfile()}
            type="button"
            variant="outline"
          >
            Ouvrir Clerk
          </Button>
        </Card>
      </div>
    </main>
  );
}
