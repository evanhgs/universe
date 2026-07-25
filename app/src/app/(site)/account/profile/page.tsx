import { auth } from "@clerk/nextjs/server";

import { getCurrentAccountSnapshot } from "@/server/account/account.service";
import { getSubscriptionSummaryForUserId } from "@/server/subscriptions/subscription.service";

import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

/**
 * Page d'edition du profil compte: public Universe + raccourci vers les parametres Clerk.
 * @returns Formulaire de profil pour l'utilisateur connecte.
 */
export default async function AccountProfilePage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return (
      <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-4xl px-6 py-10">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">Profil</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Connecte-toi depuis le header pour modifier ton profil Universe.
        </p>
      </main>
    );
  }

  const account = await getCurrentAccountSnapshot();
  const subscription = await getSubscriptionSummaryForUserId(account.user.id);

  return <ProfileForm initialAccount={account} subscription={subscription} />;
}
