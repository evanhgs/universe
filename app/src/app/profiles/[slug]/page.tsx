import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChatContactButton } from "@/app/chat-contact-button";
import { Badge } from "@/components/ui/badge";
import { PAGE_PATHS } from "@/lib/paths";
import { getProfilePayloadBySlug } from "@/server/profiles/profile.service";

type ProfilePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamic = "force-dynamic";

/**
 * Page serveur affichant un profil vendeur et un extrait de son catalogue.
 * @param props.params Parametres de route contenant le slug profil.
 * @returns Markup de detail profil ou notFound si inaccessible.
 */
export default async function ProfilePage({ params }: ProfilePageProps) {
  const { slug } = await params;
  const { userId } = await auth();
  const profile = await getProfilePayloadBySlug(slug, userId ?? null);

  if (!profile) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-6xl px-6 py-10">
      <section className="border-b border-border pb-8">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
          {profile.roles.includes('SELLER') ? "profile vendeur" : "profile utilisateur"}
        </p>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-semibold tracking-tight text-foreground">
                {profile.displayName}
              </h1>
              {profile.subscription.isPremium ? (
                <Badge className="bg-brand-muted text-brand-dark dark:text-brand-light">
                  Universe actif
                </Badge>
              ) : null}
            </div>
          </div>
          {!profile.visibility.viewerCanEdit ? (
            <ChatContactButton
              label="Contacter"
              targetProfileSlug={profile.slug}
            />
          ) : null}
        </div>
        <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
          {profile.bio ?? "Cet utilisateur n'a pas encore ajoute de description."}
        </p>
        <div className="mt-5 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span>{profile.stats.beatCount} instrumentales publiees</span>
          <span>{profile.stats.saleCount} ventes</span>
          <span>{profile.stats.followerCount} followers</span>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold text-foreground">Catalogue</h2>
          <Link className="text-sm font-medium text-muted-foreground hover:text-foreground" href={PAGE_PATHS.beats.catalog.getHref({ sellerSlug: profile.slug })}>
            Voir tout
          </Link>
        </div>
        {profile.beats.length === 0 ? (
          <p className="mt-5 border border-dashed border-border p-6 text-sm text-muted-foreground">
            Aucune instrumentale publique pour le moment.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {profile.beats.map((beat) => (
              <Link
                className="border border-border bg-card p-4"
                href={PAGE_PATHS.beats.detail.getHref(beat.slug)}
                key={beat.id}
              >
                <h3 className="font-semibold text-foreground">{beat.title}</h3>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                  {beat.description ?? "Sans description."}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
