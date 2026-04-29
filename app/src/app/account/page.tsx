import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

import { getCurrentAccountSnapshot } from "@/server/account/account.service";

export const dynamic = "force-dynamic";

const primaryLinkClass =
  "inline-flex h-10 items-center justify-center rounded-full bg-black px-4 text-sm font-medium text-white";
const secondaryLinkClass =
  "inline-flex h-10 items-center justify-center rounded-full border border-black/15 px-4 text-sm font-medium text-black";

/**
 * Page compte privee: elle agrege profil, acces achats/ventes et liens de gestion.
 * @returns Tableau de bord du compte courant ou invitation a se connecter.
 */
export default async function AccountPage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return (
      <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-5xl px-6 py-10">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-black/45">
          Compte
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-black">
          Connecte-toi pour gerer ton profil.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">
          Le header ouvre Clerk pour la connexion et Universe charge ensuite ton profil local.
        </p>
      </main>
    );
  }

  const account = await getCurrentAccountSnapshot();
  const isSeller = account.roles.includes("SELLER");
  const fullName = [account.user.firstName, account.user.lastName].filter(Boolean).join(" ");

  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-6xl px-6 py-10">
      <section className="border-b border-black/10 pb-8">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-black/45">
          Mon compte
        </p>
        <div className="mt-3 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-black">
              {account.profile.displayName}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">
              {account.profile.bio ??
                "Ajoute une bio pour presenter ton univers, ton catalogue ou tes besoins d'achat."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className={primaryLinkClass} href="/account/profile">
              Modifier le profil
            </Link>
            <Link className={secondaryLinkClass} href={`/profiles/${account.profile.slug}`}>
              Voir le profil public
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <article className="border border-black/10 bg-white p-5">
          <p className="text-sm font-semibold text-black">Identite</p>
          <dl className="mt-4 grid gap-3 text-sm text-black/65">
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-black/40">Nom</dt>
              <dd className="mt-1 text-black">{fullName || "Non renseigne"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-black/40">Email</dt>
              <dd className="mt-1 break-all text-black">{account.user.email}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-black/40">Username</dt>
              <dd className="mt-1 text-black">{account.user.username ?? "Non renseigne"}</dd>
            </div>
          </dl>
        </article>

        <article className="border border-black/10 bg-white p-5">
          <p className="text-sm font-semibold text-black">Profil public</p>
          <dl className="mt-4 grid gap-3 text-sm text-black/65">
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-black/40">Slug</dt>
              <dd className="mt-1 text-black">/{account.profile.slug}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-black/40">Visibilite</dt>
              <dd className="mt-1 text-black">
                {account.profile.isPublic ? "Public" : "Prive"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.18em] text-black/40">Localisation</dt>
              <dd className="mt-1 text-black">
                {[account.profile.city, account.profile.countryCode].filter(Boolean).join(", ") ||
                  "Non renseignee"}
              </dd>
            </div>
          </dl>
        </article>

        <article className="border border-black/10 bg-white p-5">
          <p className="text-sm font-semibold text-black">Roles</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {account.roles.map((role) => (
              <span
                className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-black/65"
                key={role}
              >
                {role}
              </span>
            ))}
          </div>
          <p className="mt-4 text-sm leading-6 text-black/60">
            Tous les comptes restent acheteurs par defaut. Active le role vendeur depuis ton profil
            pour exposer un catalogue.
          </p>
        </article>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold text-black">Acces rapides</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Link className="border border-black/10 bg-white p-5 hover:border-black/25" href="/account/purchases">
            <h3 className="font-semibold text-black">Mes achats</h3>
            <p className="mt-2 text-sm leading-6 text-black/60">
              Retrouve tes licences payees et tes liens de telechargement.
            </p>
          </Link>
          <Link className="border border-black/10 bg-white p-5 hover:border-black/25" href="/account/sales">
            <h3 className="font-semibold text-black">Mes ventes</h3>
            <p className="mt-2 text-sm leading-6 text-black/60">
              Consulte les lignes de commandes vendues avec ton role vendeur.
            </p>
          </Link>
          <Link className="border border-black/10 bg-white p-5 hover:border-black/25" href="/beats">
            <h3 className="font-semibold text-black">{isSeller ? "Catalogue" : "Explorer"}</h3>
            <p className="mt-2 text-sm leading-6 text-black/60">
              {isSeller
                ? "Controle la visibilite de tes instrumentales depuis le catalogue."
                : "Decouvre les instrumentales disponibles avant de passer vendeur."}
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}
