/**
 * Beat allege transmis du serveur vers l'experience landing.
 * Les URLs d'assets sont presignees cote serveur et peuvent expirer :
 * le client doit prevoir un refetch via l'API preview en cas d'erreur.
 */
export type LandingBeat = {
  id: string;
  slug: string;
  title: string;
  sellerName: string;
  sellerSlug: string | null;
  bpm: number | null;
  musicalKey: string | null;
  genre: string | null;
  mood: string | null;
  priceAmount: number | null;
  currency: string;
  isFree: boolean;
  previewUrl: string | null;
  coverUrl: string | null;
};

/**
 * Formate un enum Prisma (TRAP, R_AND_B, BOOM_BAP...) en label lisible.
 * @param value Valeur brute de l'enum ou null.
 * @returns Label uppercase pret a afficher, ou chaine vide.
 */
export function formatEnumLabel(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.replaceAll("_AND_", " & ").replaceAll("_", " ");
}

/**
 * Formate le prix d'un beat pour la grille landing.
 * @param beat Beat landing avec prix, devise et flag gratuit.
 * @returns Prix formate fr-FR, "FREE" ou chaine vide.
 */
export function formatBeatPrice(beat: Pick<LandingBeat, "priceAmount" | "currency" | "isFree">) {
  if (beat.isFree) {
    return "FREE";
  }

  if (beat.priceAmount === null) {
    return "";
  }

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: beat.currency || "EUR",
    maximumFractionDigits: 0,
  }).format(beat.priceAmount);
}
