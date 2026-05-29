"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

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
};

type JsonBody = {
  error?: unknown;
  message?: unknown;
};

const inputClass =
  "mt-2 h-11 w-full border border-black/15 bg-white px-3 text-sm text-black outline-none transition focus:border-black";
const textareaClass =
  "mt-2 min-h-32 w-full resize-y border border-black/15 bg-white px-3 py-3 text-sm text-black outline-none transition focus:border-black";
const labelClass = "text-sm font-medium text-black";
const helperClass = "mt-1 text-xs leading-5 text-black/45";

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
export function ProfileForm({ initialAccount }: ProfileFormProps) {
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
      <div className="border-b border-black/10 pb-8">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-black/45">
          Profil
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-black">
          Modifier mon profil
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">
          Universe gere les infos publiques du marketplace. Clerk reste ton espace de reference
          pour email, mot de passe, sessions et securite du compte.
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

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_280px]">
        <section className="border border-black/10 bg-white p-5">
          <div className="grid gap-5 md:grid-cols-2">
            <label className={labelClass}>
              Prenom
              <input
                className={inputClass}
                onChange={(event) => setFirstName(event.target.value)}
                value={firstName}
              />
            </label>
            <label className={labelClass}>
              Nom
              <input
                className={inputClass}
                onChange={(event) => setLastName(event.target.value)}
                value={lastName}
              />
            </label>
            <label className={labelClass}>
              Username Clerk
              <input
                className={inputClass}
                onChange={(event) => setUsername(event.target.value.toLowerCase())}
                value={username}
              />
              <span className={helperClass}>Lettres, chiffres, tirets et underscores.</span>
            </label>
            <label className={labelClass}>
              Nom public
              <input
                className={inputClass}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
            </label>
            <label className={labelClass}>
              Slug public
              <input
                className={inputClass}
                onChange={(event) => setSlug(event.target.value.toLowerCase())}
                required
                value={slug}
              />
              <span className={helperClass}>URL publique: /profiles/{slug || "mon-profil"}</span>
            </label>
            <div className="grid gap-5 md:grid-cols-2">
              <label className={labelClass}>
                Ville
                <input
                  className={inputClass}
                  onChange={(event) => setCity(event.target.value)}
                  value={city}
                />
              </label>
              <label className={labelClass}>
                Pays
                <input
                  className={inputClass}
                  maxLength={2}
                  onChange={(event) => setCountryCode(event.target.value.toUpperCase())}
                  placeholder="FR"
                  value={countryCode}
                />
              </label>
            </div>
          </div>

          <label className={`mt-5 block ${labelClass}`}>
            Bio
            <textarea
              className={textareaClass}
              maxLength={500}
              onChange={(event) => setBio(event.target.value)}
              value={bio}
            />
            <span className={helperClass}>{bio.length}/500 caracteres.</span>
          </label>

          <div className="mt-6 grid gap-3 border-t border-black/10 pt-5">
            <label className="flex items-start gap-3 text-sm text-black">
              <input
                checked={isPublic}
                className="mt-1 h-4 w-4"
                onChange={(event) => setIsPublic(event.target.checked)}
                type="checkbox"
              />
              <span>
                Profil public
                <span className="block text-xs leading-5 text-black/45">
                  Si le profil est prive, seul ton compte peut consulter la page publique.
                </span>
              </span>
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="inline-flex h-11 items-center justify-center rounded-full bg-black px-5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-black/35"
              disabled={isSaving}
              onClick={() => void saveProfile()}
              type="button"
            >
              {isSaving ? "Enregistrement..." : "Enregistrer"}
            </button>
            <Link
              className="inline-flex h-11 items-center justify-center rounded-full border border-black/15 px-5 text-sm font-medium text-black"
              href="/account"
            >
              Retour au compte
            </Link>
          </div>
        </section>

        <aside className="border border-black/10 bg-black/[0.02] p-5">
          <h2 className="text-lg font-semibold text-black">Parametres Clerk</h2>
          <p className="mt-2 text-sm leading-6 text-black/60">
            Utilise Clerk pour gerer email, mot de passe, sessions actives et les
            controles de securite.
          </p>
          <p className="mt-4 break-all text-sm text-black/55">{initialAccount.user.email}</p>
          <button
            className="mt-5 inline-flex h-10 items-center justify-center rounded-full border border-black/15 px-4 text-sm font-medium text-black"
            onClick={() => openUserProfile()}
            type="button"
          >
            Ouvrir Clerk
          </button>
        </aside>
      </div>
    </main>
  );
}
