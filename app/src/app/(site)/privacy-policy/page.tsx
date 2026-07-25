import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Politique de confidentialité | Universe",
  description:
    "Politique de confidentialité et engagements RGPD de la marketplace Universe.",
};

const lastUpdated = "6 juin 2026";

const sections = [
  {
    title: "1. Responsable du traitement",
    body: [
      "Le responsable du traitement est Universe - A compléter avec la dénomination sociale, la forme juridique, le numéro SIREN/SIRET et l'adresse du siège.",
      "Contact données personnelles : A compléter avec une adresse e-mail dédiée, par exemple privacy@example.com.",
      "Délégué à la protection des données, si désigné : A compléter avec les coordonnées du DPO.",
    ],
  },
  {
    title: "2. Engagement RGPD",
    body: [
      "Universe s'engage à respecter le Règlement général sur la protection des données (RGPD), la loi Informatique et Libertés et les recommandations applicables de la CNIL.",
      "Les données personnelles sont traitées de manière licite, loyale et transparente, pour des finalités déterminées, explicites et légitimes. Universe applique un principe de minimisation et ne collecte que les données nécessaires au fonctionnement du service.",
    ],
  },
  {
    title: "3. Données collectées",
    body: [
      "Données de compte : identifiant utilisateur, adresse e-mail, nom, prénom, nom d'utilisateur, préférences et rôles du compte.",
      "Données de profil : nom public, biographie, slug, localisation déclarée, avatar ou informations publiques ajoutées par l'utilisateur.",
      "Données marketplace : contenus publiés, métadonnées de beats, commandes, licences, téléchargements, historique d'achat ou de vente.",
      "Données de paiement : identifiants de transaction, statut de paiement, montants, devise et informations nécessaires au suivi comptable. Les données complètes de carte bancaire sont traitées par le prestataire de paiement et ne sont pas stockées par Universe.",
      "Données techniques : journaux serveur, adresse IP, informations de sécurité, données de session, mesures d'audience strictement nécessaires ou soumises au consentement lorsque requis.",
      "Données de communication : messages échangés via le service, demandes de support et notifications envoyées par e-mail.",
    ],
  },
  {
    title: "4. Finalités et bases légales",
    body: [
      "Création et gestion du compte : exécution du contrat ou mesures précontractuelles.",
      "Publication, achat, vente, livraison et téléchargement de contenus : exécution du contrat.",
      "Paiement, facturation, comptabilité et lutte contre la fraude : exécution du contrat, obligation légale et intérêt légitime.",
      "Sécurité, prévention des abus, maintenance et amélioration du service : intérêt légitime de Universe à protéger la plateforme et ses utilisateurs.",
      "Support utilisateur et communications de service : exécution du contrat ou intérêt légitime.",
      "Prospection commerciale, newsletters ou cookies non essentiels : consentement lorsque celui-ci est requis.",
    ],
  },
  {
    title: "5. Destinataires et sous-traitants",
    body: [
      "Les données peuvent être accessibles aux équipes habilitées de Universe, dans la limite de leurs missions.",
      "Universe peut recourir à des prestataires techniques pour l'hébergement, l'authentification, le paiement, l'envoi d'e-mails, la supervision, l'analyse d'erreurs et le stockage. A la date de cette politique, le service peut notamment utiliser Clerk, Stripe, Resend, Sentry, une base PostgreSQL, Redis et un stockage compatible S3 selon l'environnement déployé.",
      "Ces prestataires agissent comme sous-traitants ou responsables de traitement indépendants selon les cas. Universe veille à encadrer ces traitements par des garanties contractuelles adaptées.",
    ],
  },
  {
    title: "6. Transferts hors Union européenne",
    body: [
      "Lorsque des données sont transférées en dehors de l'Union européenne, Universe s'assure que le transfert repose sur un mécanisme reconnu par le RGPD, par exemple une décision d'adéquation, des clauses contractuelles types ou toute autre garantie appropriée.",
      "Les utilisateurs peuvent demander des informations complémentaires sur ces garanties via le contact données personnelles indiqué dans cette politique.",
    ],
  },
  {
    title: "7. Durées de conservation",
    body: [
      "Données de compte : conservées pendant la durée d'utilisation du compte, puis supprimées ou archivées dans les délais nécessaires à la gestion des obligations légales et des litiges.",
      "Données de commande, paiement et facturation : conservées pendant la durée imposée par les obligations comptables, fiscales et probatoires applicables.",
      "Messages et demandes de support : conservés pendant la durée nécessaire au traitement de la demande, puis archivés ou supprimés selon leur utilité probatoire.",
      "Journaux techniques et données de sécurité : conservés pour une durée limitée proportionnée aux besoins de sécurité, de diagnostic et de preuve.",
      "Cookies et traceurs : conservés selon leur finalité et les recommandations applicables de la CNIL. Les choix de consentement peuvent être conservés afin de respecter la décision de l'utilisateur.",
    ],
  },
  {
    title: "8. Cookies et traceurs",
    body: [
      "Universe peut utiliser des cookies ou technologies similaires nécessaires au fonctionnement du service, à la sécurité, à l'authentification, à la mémorisation des préférences et à la mesure technique.",
      "Les traceurs non strictement nécessaires, notamment certains traceurs de mesure d'audience, de publicité ou de personnalisation, ne sont déposés qu'après consentement lorsque la loi l'exige.",
      "L'utilisateur doit pouvoir accepter, refuser ou retirer son consentement avec une simplicité équivalente. Le refus des cookies non essentiels n'empêche pas l'accès au service, sauf lorsque le traceur est nécessaire à la fonctionnalité demandée.",
    ],
  },
  {
    title: "9. Droits des personnes",
    body: [
      "Conformément au RGPD, l'utilisateur peut demander l'accès à ses données, leur rectification, leur effacement, la limitation du traitement, la portabilité de ses données lorsque ce droit s'applique, ou s'opposer à certains traitements.",
      "Lorsque le traitement repose sur le consentement, l'utilisateur peut retirer son consentement à tout moment, sans remettre en cause la licéité du traitement effectué avant ce retrait.",
      "Pour exercer ces droits, l'utilisateur peut contacter Universe via le contact données personnelles indiqué dans cette politique. Une preuve d'identité peut être demandée lorsque cela est nécessaire pour éviter une divulgation non autorisée.",
    ],
  },
  {
    title: "10. Réclamation auprès de la CNIL",
    body: [
      "Si l'utilisateur estime que ses droits ne sont pas respectés, il peut introduire une réclamation auprès de la CNIL.",
      "Site de la CNIL : https://www.cnil.fr",
    ],
  },
  {
    title: "11. Sécurité",
    body: [
      "Universe met en œuvre des mesures techniques et organisationnelles destinées à protéger les données personnelles contre l'accès non autorisé, la perte, l'altération ou la divulgation.",
      "Ces mesures peuvent inclure le contrôle des accès, l'authentification, la journalisation, le chiffrement en transit, la segmentation des droits et la surveillance des incidents.",
    ],
  },
  {
    title: "12. Mise à jour de la politique",
    body: [
      "Cette politique peut être mise à jour pour refléter les évolutions du service, des traitements ou du cadre légal. La version applicable est celle publiée sur cette page.",
      "En cas de modification substantielle, Universe pourra informer les utilisateurs par un moyen approprié.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto min-h-[calc(100vh-73px)] w-full max-w-4xl px-6 py-10">
      <header className="border-b border-border pb-8">
        <p className="text-sm font-medium uppercase text-muted-foreground">
          Données personnelles
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
          Politique de confidentialité
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
            {section.body.map((paragraph) => {
              const isCnilUrl = paragraph === "Site de la CNIL : https://www.cnil.fr";

              return (
                <p
                  className="text-sm leading-7 text-muted-foreground"
                  key={paragraph}
                >
                  {isCnilUrl ? (
                    <>
                      Site de la CNIL :{" "}
                      <Link
                        className="font-medium text-primary underline-offset-4 hover:underline"
                        href="https://www.cnil.fr"
                      >
                        cnil.fr
                      </Link>
                    </>
                  ) : (
                    paragraph
                  )}
                </p>
              );
            })}
          </section>
        ))}
      </div>
    </main>
  );
}
