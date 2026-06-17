import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Conditions générales d'utilisation | Universe",
  description: "Conditions générales d'utilisation de la marketplace Universe.",
};

const lastUpdated = "6 juin 2026";

import { PAGE_PATHS } from "@/lib/paths";

const sections = [
  {
    title: "1. Objet",
    body: [
      "Les présentes conditions générales d'utilisation encadrent l'accès et l'utilisation du site Universe, une marketplace française dédiée à la découverte, la publication, la vente et l'achat d'instrumentales, beats, licences et contenus musicaux associés.",
      "En créant un compte, en publiant un contenu, en achetant une licence ou en utilisant le service, l'utilisateur accepte les présentes conditions.",
    ],
  },
  {
    title: "2. Éditeur du service",
    body: [
      "Éditeur : Universe",
      "Contact : evanhugues@proton.me",
      "Hébergeur : evanhugues@proton.me",
    ],
  },
  {
    title: "3. Accès au service et compte utilisateur",
    body: [
      "Certaines fonctionnalités nécessitent la création d'un compte. L'utilisateur s'engage à fournir des informations exactes, à les maintenir à jour et à préserver la confidentialité de ses identifiants.",
      "Universe peut suspendre ou restreindre un compte en cas d'utilisation frauduleuse, d'atteinte aux droits de tiers, de violation des présentes conditions ou d'obligation légale.",
    ],
  },
  {
    title: "4. Rôles acheteur et vendeur",
    body: [
      "Un utilisateur peut acheter des licences d'utilisation de contenus publiés sur la marketplace. Un utilisateur vendeur peut publier des contenus après vérification ou activation du rôle vendeur par Universe.",
      "Le vendeur garantit qu'il dispose de tous les droits nécessaires sur les contenus publiés et qu'ils ne portent pas atteinte aux droits de propriété intellectuelle, droits voisins, droits à l'image ou droits de tiers.",
    ],
  },
  {
    title: "5. Licences, achats et paiements",
    body: [
      "Les achats donnent accès aux droits décrits dans la licence associée au contenu acheté. Sauf stipulation contraire dans la licence, aucun transfert de propriété intellectuelle n'est accordé.",
      "Les paiements peuvent être traités par un prestataire de paiement tiers, notamment Stripe. Les informations de paiement sont traitées par ce prestataire selon ses propres conditions et règles de sécurité.",
      "Les prix, taxes applicables, droits accordés, restrictions d'usage et modalités de téléchargement sont indiqués avant la validation de la commande lorsque la fonctionnalité est disponible.",
    ],
  },
  {
    title: "6. Contenus interdits",
    body: [
      "Il est interdit de publier ou transmettre des contenus illicites, contrefaisants, trompeurs, haineux, discriminatoires, violents, portant atteinte à la vie privée ou contenant des logiciels malveillants.",
      "Universe peut retirer un contenu manifestement illicite ou litigieux et coopérer avec les autorités compétentes lorsque la loi l'exige.",
    ],
  },
  {
    title: "7. Disponibilité et évolution du service",
    body: [
      "Universe fait ses meilleurs efforts pour maintenir le service accessible, sans garantir une disponibilité permanente. Des interruptions peuvent intervenir pour maintenance, évolution, sécurité ou cas de force majeure.",
      "Le service peut évoluer afin d'améliorer l'expérience utilisateur, la sécurité, la conformité légale ou les fonctionnalités de la marketplace.",
    ],
  },
  {
    title: "8. Responsabilité",
    body: [
      "Universe agit comme intermédiaire technique pour la mise en relation entre utilisateurs lorsque des contenus sont publiés par des vendeurs. Chaque utilisateur reste responsable des contenus qu'il publie, vend, achète ou utilise.",
      "Universe ne peut être tenu responsable d'une utilisation non conforme des contenus achetés, d'une violation de licence par un utilisateur ou d'un préjudice indirect résultant de l'utilisation du service.",
    ],
  },
  {
    title: "9. Données personnelles",
    body: [
      "Universe s'engage à traiter les données personnelles conformément au RGPD, à la loi Informatique et Libertés et à la réglementation française applicable.",
      "Les informations détaillées sur les traitements, les bases légales, les durées de conservation, les destinataires et les droits des personnes sont disponibles dans la politique de confidentialité.",
    ],
    link: {
      href: PAGE_PATHS.legal.privacyPolicy.getHref(),
      label: "Consulter la politique de confidentialité",
    },
  },
  {
    title: "10. Modification des conditions",
    body: [
      "Universe peut modifier les présentes conditions pour tenir compte des évolutions du service, de la réglementation ou de ses pratiques. La version applicable est celle publiée sur cette page à la date d'utilisation du service.",
      "En cas de changement substantiel, Universe pourra informer les utilisateurs par tout moyen approprié.",
    ],
  },
  {
    title: "11. Droit applicable et règlement des litiges",
    body: [
      "Les présentes conditions sont régies par le droit français. En cas de différend, l'utilisateur est invité à contacter Universe afin de rechercher une solution amiable.",
      "A défaut de résolution amiable, les juridictions compétentes seront déterminées conformément aux règles de procédure applicables.",
    ],
  },
];

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-4xl px-6 py-10">
      <header className="border-b border-border pb-8">
        <p className="text-sm font-medium uppercase text-muted-foreground">
          Conditions légales
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
          Conditions générales d&apos;utilisation
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Dernière mise à jour : {lastUpdated}
        </p>
      </header>

      <div className="mt-8 space-y-8">
        {sections.map((section) => (
          <section className="space-y-3" key={section.title}>
            <h2 className="text-2xl font-semibold text-foreground">
              {section.title}
            </h2>
            {section.body.map((paragraph) => (
              <p
                className="text-sm leading-7 text-muted-foreground"
                key={paragraph}
              >
                {paragraph}
              </p>
            ))}
            {section.link ? (
              <Link
                className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                href={section.link.href}
              >
                {section.link.label}
              </Link>
            ) : null}
          </section>
        ))}
      </div>
    </main>
  );
}
