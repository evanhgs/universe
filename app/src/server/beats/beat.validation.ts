import "server-only";

import {
  MainGenres,
  Moods,
  SecondGenres,
  Tags,
  UsageTags,
  type BeatStatus,
  type LicenseScope,
  type MainGenres as MainGenre,
  type Moods as Mood,
  type SecondGenres as SecondGenre,
  type Tags as Tag,
  type UsageTags as UsageTag,
  type Visibility,
} from "../../../generated/prisma/enums";
import {
  BEAT_METADATA_LIMITS,
  secondGenresForMainGenres,
} from "@/lib/beat-metadata";
import { DEFAULT_BEAT_CURRENCY } from "./beat.constants";
import type {
  BeatAssetInput,
  BeatFeedCursor,
  BeatFeedQuery,
  BeatListQuery,
  CreateBeatInput,
  UpdateBeatInput,
} from "./beat.types";

const allowedVisibility = new Set<Visibility>(["PUBLIC", "UNLISTED", "PRIVATE"]);
const allowedEditableStatuses = new Set<BeatStatus>(["DRAFT", "PUBLISHED", "HIDDEN", "ARCHIVED"]);
const allowedLicenseScopes = new Set<LicenseScope>([
  "BASIC",
  "PREMIUM",
  "UNLIMITED",
  "EXCLUSIVE",
  "CUSTOM",
]);
const allowedSorts = new Set<BeatListQuery["sort"]>([
  "newest",
  "price_asc",
  "price_desc",
  "bpm_asc",
  "bpm_desc",
]);
const allowedMainGenres = new Set<MainGenre>(Object.values(MainGenres));
const allowedSecondGenres = new Set<SecondGenre>(Object.values(SecondGenres));
const allowedMoods = new Set<Mood>(Object.values(Moods));
const allowedTags = new Set<Tag>(Object.values(Tags));
const allowedUsageTags = new Set<UsageTag>(Object.values(UsageTags));
const MAX_LICENSE_OFFERINGS = 3;
const DEFAULT_FEED_LIMIT = 10;
const MAX_FEED_LIMIT = 20;
const defaultLicenseTitles: Record<LicenseScope, string> = {
  BASIC: "MP3",
  PREMIUM: "WAV",
  UNLIMITED: "Pistes separees",
  EXCLUSIVE: "Exclusive",
  CUSTOM: "Personnalisee",
};

/**
 * Normalise une chaine optionnelle depuis un payload beat.
 * @param value Valeur brute a accepter comme undefined, null ou string.
 * @returns Chaine trimmee, null si vide, ou undefined si absente.
 */
function normalizeOptionalString(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("Expected a string value.");
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

/**
 * Exige une chaine non vide pour un champ obligatoire.
 * @param value Valeur brute du payload.
 * @param field Nom du champ utilise dans les erreurs.
 */
function requireString(value: unknown, field: string) {
  const normalized = normalizeOptionalString(value);

  if (!normalized) {
    throw new Error(`${field} is required.`);
  }

  return normalized;
}

/**
 * Parse un entier optionnel borne.
 * @param value Valeur brute.
 * @param field Nom du champ.
 * @param min Valeur minimale incluse.
 * @param max Valeur maximale incluse.
 */
function parseOptionalInteger(value: unknown, field: string, min: number, max: number) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}.`);
  }

  return parsed;
}

/**
 * Valide un prix obligatoire en euros ou autre devise, limite a deux decimales.
 * @param value Valeur numerique brute.
 */
function parsePrice(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100000) {
    throw new Error("priceAmount must be a valid positive amount.");
  }

  return Math.round(parsed * 100) / 100;
}

/**
 * Valide un prix optionnel borne et arrondi a deux decimales.
 * @param value Valeur brute.
 * @param field Nom du champ.
 */
function parseOptionalPrice(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100000) {
    throw new Error(`${field} must be a valid positive amount.`);
  }

  return Math.round(parsed * 100) / 100;
}

/**
 * Valide une devise ISO 4217 ou applique la devise par defaut.
 * @param value Devise brute.
 */
function parseCurrency(value: unknown) {
  const currency = normalizeOptionalString(value) ?? DEFAULT_BEAT_CURRENCY;

  if (!/^[A-Z]{3}$/.test(currency.toUpperCase())) {
    throw new Error("currency must be a 3-letter ISO code.");
  }

  return currency.toUpperCase();
}

/**
 * Cree une cle de comparaison stable pour detecter les titres de licence dupliques.
 * @param value Titre public de licence.
 */
function normalizeLicenseTitleKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Valide et dedoublonne une liste d'enums depuis le payload JSON.
 * @param value Tableau de valeurs brutes.
 * @param field Nom du champ.
 * @param allowedValues Valeurs enum autorisees.
 * @param maxItems Taille maximale.
 */
function parseEnumList<T extends string>(
  value: unknown,
  field: string,
  allowedValues: Set<T>,
  maxItems: number,
) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }

  const items = Array.from(
    new Set(
      value.map((item) => {
        if (typeof item !== "string") {
          throw new Error(`${field} must only contain strings.`);
        }

        return item.trim().toUpperCase();
      }).filter(Boolean),
    ),
  ) as T[];

  const invalid = items.find((item) => !allowedValues.has(item));

  if (invalid) {
    throw new Error(`${field} contains an invalid value.`);
  }

  if (items.length > maxItems) {
    throw new Error(`${field} cannot contain more than ${maxItems} values.`);
  }

  return items;
}

function parseMainGenres(value: unknown) {
  return parseEnumList(
    value,
    "mainGenres",
    allowedMainGenres,
    BEAT_METADATA_LIMITS.mainGenres,
  );
}

function parseSecondGenres(value: unknown, mainGenres: MainGenre[]) {
  const secondGenres = parseEnumList(
    value,
    "secondGenres",
    allowedSecondGenres,
    BEAT_METADATA_LIMITS.secondGenres,
  );
  const allowedForMainGenres = new Set(secondGenresForMainGenres(mainGenres));
  const invalid = secondGenres.find((genre) => !allowedForMainGenres.has(genre));

  if (invalid) {
    throw new Error("secondGenres contains a value incompatible with mainGenres.");
  }

  return secondGenres;
}

function parseMoods(value: unknown) {
  return parseEnumList(value, "moods", allowedMoods, BEAT_METADATA_LIMITS.moods);
}

function parseTags(value: unknown) {
  return parseEnumList(value, "tags", allowedTags, BEAT_METADATA_LIMITS.tags);
}

function parseUsageTags(value: unknown) {
  return parseEnumList(
    value,
    "usageTags",
    allowedUsageTags,
    BEAT_METADATA_LIMITS.usageTags,
  );
}

/**
 * Parse le parametre query tags sous forme de liste separee par virgules.
 * @param value Parametre URL brut.
 */
function parseTagListParam(value: string | null) {
  if (!value) {
    return undefined;
  }

  const tags = Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim().toUpperCase() as Tag)
        .filter(Boolean),
    ),
  ).filter((tag) => allowedTags.has(tag));

  return tags.length > 0 ? tags.slice(0, BEAT_METADATA_LIMITS.tags) : undefined;
}

/**
 * Valide la visibilite demandee pour un beat.
 * @param value Valeur brute, PUBLIC par defaut.
 */
function parseVisibility(value: unknown) {
  const visibility = (normalizeOptionalString(value) ?? "PUBLIC").toUpperCase() as Visibility;

  if (!allowedVisibility.has(visibility)) {
    throw new Error("visibility is invalid.");
  }

  return visibility;
}

/**
 * Valide le statut editable d'un beat.
 * @param value Valeur brute optionnelle.
 */
function parseStatus(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const status = requireString(value, "status").toUpperCase() as BeatStatus;

  if (!allowedEditableStatuses.has(status)) {
    throw new Error("status is invalid.");
  }

  return status;
}

/**
 * Valide un filtre de type de licence dans les query params.
 * @param value Parametre URL licenseType.
 */
function parseLicenseType(value: string | null) {
  const licenseType = normalizeOptionalString(value)?.toUpperCase() as
    | LicenseScope
    | undefined;

  if (licenseType === undefined) {
    return undefined;
  }

  if (!allowedLicenseScopes.has(licenseType)) {
    throw new Error("licenseType is invalid.");
  }

  return licenseType;
}

function parseOptionalEnumParam<T extends string>(
  value: string | null,
  field: string,
  allowedValues: Set<T>,
) {
  const normalized = normalizeOptionalString(value)?.toUpperCase() as T | undefined;

  if (normalized === undefined) {
    return undefined;
  }

  if (!allowedValues.has(normalized)) {
    throw new Error(`${field} is invalid.`);
  }

  return normalized;
}

/**
 * Valide l'ordre de tri public des beats.
 * @param value Parametre URL sort.
 */
function parseSort(value: string | null): BeatListQuery["sort"] {
  const sort = (normalizeOptionalString(value) ?? "newest").toLowerCase() as BeatListQuery["sort"];

  if (!allowedSorts.has(sort)) {
    throw new Error("sort is invalid.");
  }

  return sort;
}

/**
 * Parse une limite positive bornee depuis les query params publics.
 * @param value Valeur brute.
 * @param fallback Valeur par defaut si absente ou invalide.
 * @param max Valeur maximale autorisee.
 */
function parsePositiveLimit(value: string | null, fallback: number, max: number) {
  const limit = Number(value ?? fallback);

  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, max) : fallback;
}

/**
 * Decode le curseur opaque du feed.
 * @param value Parametre cursor en base64url/base64.
 */
function parseFeedCursor(value: string | null): BeatFeedCursor | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;

    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
      throw new Error("invalid_cursor");
    }

    const cursor = decoded as Record<string, unknown>;

    if (typeof cursor.id !== "string" || typeof cursor.publishedAt !== "string") {
      throw new Error("invalid_cursor");
    }

    const publishedAt = new Date(cursor.publishedAt);

    if (Number.isNaN(publishedAt.getTime())) {
      throw new Error("invalid_cursor");
    }

    return {
      id: cursor.id,
      publishedAt: publishedAt.toISOString(),
    };
  } catch {
    throw new Error("feed_cursor_invalid");
  }
}

/**
 * Parse un booleen strict avec valeur par defaut.
 * @param value Valeur brute.
 * @param defaultValue Valeur retournee quand le champ est absent.
 */
function parseBoolean(value: unknown, defaultValue: boolean) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value !== "boolean") {
    throw new Error("Expected a boolean value.");
  }

  return value;
}

/**
 * Valide la description d'un asset deja uploade avant association a un beat.
 * @param value Objet asset brut.
 * @param field Prefixe de champ pour les erreurs.
 */
function parseAsset(value: unknown, field: string): BeatAssetInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }

  const body = value as Record<string, unknown>;
  const sizeBytes = parseOptionalInteger(body.sizeBytes, `${field}.sizeBytes`, 0, Number.MAX_SAFE_INTEGER);

  return {
    bucket: requireString(body.bucket, `${field}.bucket`),
    objectKey: requireString(body.objectKey, `${field}.objectKey`),
    originalFilename: normalizeOptionalString(body.originalFilename),
    mimeType: normalizeOptionalString(body.mimeType),
    extension: normalizeOptionalString(body.extension),
    sizeBytes,
    checksumSha256: normalizeOptionalString(body.checksumSha256),
  };
}

/**
 * Verifie que l'asset source peut servir a generer une preview audio.
 * @param asset Asset audio normalise.
 */
function isAudioPreviewSourceAsset(asset: BeatAssetInput) {
  const mimeType = asset.mimeType?.toLowerCase();
  const extension = asset.extension?.toLowerCase() ?? asset.originalFilename?.split(".").pop()?.toLowerCase();

  return (
    mimeType === "audio/mpeg" ||
    mimeType === "audio/mp3" ||
    mimeType === "audio/wav" ||
    mimeType === "audio/x-wav" ||
    extension === "mp3" ||
    extension === "wav"
  );
}

/**
 * Valide le scope d'une licence.
 * @param value Valeur brute.
 * @param field Nom du champ pour les erreurs.
 */
function parseLicenseScope(value: unknown, field: string) {
  const scope = requireString(value, field).toUpperCase() as LicenseScope;

  if (!allowedLicenseScopes.has(scope)) {
    throw new Error(`${field} is invalid.`);
  }

  return scope;
}

/**
 * Valide les offres de licence et cree une offre BASIC par defaut si elles sont absentes.
 * @param value Tableau brut licenseOfferings.
 * @param fallback Prix, devise et asset audio de repli.
 */
function parseLicenseOfferings(value: unknown, fallback: {
  priceAmount: number;
  currency: string;
  audioAsset: BeatAssetInput;
}) {
  if (value === undefined || value === null) {
    return [
      {
        scope: "BASIC" as LicenseScope,
        title: defaultLicenseTitles.BASIC,
        description: null,
        priceAmount: fallback.priceAmount,
        currency: fallback.currency,
        isDefault: true,
        deliveryNotes: null,
        assets: [fallback.audioAsset],
      },
    ];
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("licenseOfferings must be a non-empty array.");
  }

  if (value.length > MAX_LICENSE_OFFERINGS) {
    throw new Error(`licenseOfferings cannot contain more than ${MAX_LICENSE_OFFERINGS} values.`);
  }

  const seenScopes = new Set<LicenseScope>();
  const seenTitles = new Set<string>();
  let defaultCount = 0;

  const offerings = value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`licenseOfferings.${index} must be an object.`);
    }

    const body = item as Record<string, unknown>;
    const scope = parseLicenseScope(body.scope, `licenseOfferings.${index}.scope`);

    if (seenScopes.has(scope)) {
      throw new Error("licenseOfferings cannot contain duplicate scopes.");
    }

    seenScopes.add(scope);

    const title = normalizeOptionalString(body.title);

    if (scope === "CUSTOM" && !title) {
      throw new Error(`licenseOfferings.${index}.title is required for custom licenses.`);
    }

    const publicTitle = title ?? defaultLicenseTitles[scope];
    const titleKey = normalizeLicenseTitleKey(publicTitle);

    if (seenTitles.has(titleKey)) {
      throw new Error("licenseOfferings cannot contain duplicate license titles.");
    }

    seenTitles.add(titleKey);

    const assetsValue = body.assets;

    if (!Array.isArray(assetsValue) || assetsValue.length === 0) {
      throw new Error(`licenseOfferings.${index}.assets must be a non-empty array.`);
    }

    const isDefault = parseBoolean(body.isDefault, index === 0);

    if (isDefault) {
      defaultCount += 1;
    }

    return {
      scope,
      title: publicTitle,
      description: normalizeOptionalString(body.description),
      priceAmount: parsePrice(body.priceAmount),
      currency: parseCurrency(body.currency),
      isDefault,
      deliveryNotes: normalizeOptionalString(body.deliveryNotes),
      assets: assetsValue.map((asset, assetIndex) =>
        parseAsset(asset, `licenseOfferings.${index}.assets.${assetIndex}`),
      ),
    };
  });

  if (defaultCount > 1) {
    throw new Error("licenseOfferings can contain only one default offering.");
  }

  return offerings.map((offering) => ({
    ...offering,
    isDefault: defaultCount === 0 ? offering === offerings[0] : offering.isDefault,
  }));
}

/**
 * Valide le payload de creation d'un beat vendeur.
 * @param payload Corps JSON brut recu par POST /api/beats.
 * @returns Donnees normalisees pretes pour le repository.
 */
export function parseCreateBeatInput(payload: unknown): CreateBeatInput {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid beat payload.");
  }

  const body = payload as Record<string, unknown>;
  const title = requireString(body.title, "title");
  const priceAmount = parsePrice(body.priceAmount);
  const isFree = parseBoolean(body.isFree, priceAmount === 0);
  const publish = parseBoolean(body.publish, false);

  if (title.length > 140) {
    throw new Error("title is too long.");
  }

  if (body.previewAsset !== undefined && body.previewAsset !== null) {
    throw new Error("previewAsset is generated automatically.");
  }

  const currency = parseCurrency(body.currency);
  const audioAsset = parseAsset(body.audioAsset, "audioAsset");
  const mainGenres = parseMainGenres(body.mainGenres);
  const secondGenres = parseSecondGenres(body.secondGenres, mainGenres);
  const moods = parseMoods(body.moods);
  const tags = parseTags(body.tags);
  const usageTags = parseUsageTags(body.usageTags);
  const licenseOfferings = parseLicenseOfferings(body.licenseOfferings, {
    priceAmount: isFree ? 0 : priceAmount,
    currency,
    audioAsset,
  });
  const defaultOffering = licenseOfferings.find((offering) => offering.isDefault);

  if (!isAudioPreviewSourceAsset(audioAsset)) {
    throw new Error("audioAsset must be an MP3 or WAV file.");
  }

  if (
    !defaultOffering ||
    !defaultOffering.assets.some((asset) => asset.objectKey === audioAsset.objectKey)
  ) {
    throw new Error("audioAsset must be attached to the default license offering.");
  }

  const thumbnailAsset =
    body.thumbnailAsset === undefined || body.thumbnailAsset === null
      ? null
      : parseAsset(body.thumbnailAsset, "thumbnailAsset");

  if (publish && !thumbnailAsset) {
    throw new Error("thumbnailAsset is required to publish.");
  }

  return {
    title,
    description: normalizeOptionalString(body.description),
    priceAmount: isFree ? 0 : priceAmount,
    currency,
    mainGenres,
    secondGenres,
    moods,
    tags,
    usageTags,
    bpm: parseOptionalInteger(body.bpm, "bpm", 20, 300),
    musicalKey: normalizeOptionalString(body.musicalKey),
    visibility: parseVisibility(body.visibility),
    publish,
    isFree,
    brandingRequired: parseBoolean(body.brandingRequired, isFree),
    audioAsset,
    thumbnailAsset,
    licenseOfferings,
  };
}

/**
 * Valide le payload de modification partielle d'un beat.
 * @param payload Corps JSON brut recu par PATCH /api/beats/[slug].
 * @returns Patch normalise contenant uniquement les champs envoyes.
 */
export function parseUpdateBeatInput(payload: unknown): UpdateBeatInput {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid beat payload.");
  }

  const body = payload as Record<string, unknown>;
  const title = normalizeOptionalString(body.title);

  if (title === null) {
    throw new Error("title cannot be empty.");
  }

  if (title !== undefined && title.length > 140) {
    throw new Error("title is too long.");
  }

  if (body.previewAsset !== undefined) {
    throw new Error("previewAsset is generated automatically.");
  }
  const mainGenres =
    body.mainGenres !== undefined ? parseMainGenres(body.mainGenres) : undefined;

  if (body.secondGenres !== undefined && mainGenres === undefined) {
    throw new Error("mainGenres is required when updating secondGenres.");
  }

  return {
    ...(title !== undefined ? { title } : {}),
    ...(body.description !== undefined ? { description: normalizeOptionalString(body.description) } : {}),
    ...(body.priceAmount !== undefined ? { priceAmount: parsePrice(body.priceAmount) } : {}),
    ...(body.currency !== undefined ? { currency: parseCurrency(body.currency) } : {}),
    ...(mainGenres !== undefined ? { mainGenres } : {}),
    ...(body.secondGenres !== undefined
      ? { secondGenres: parseSecondGenres(body.secondGenres, mainGenres ?? []) }
      : {}),
    ...(body.moods !== undefined ? { moods: parseMoods(body.moods) } : {}),
    ...(body.tags !== undefined ? { tags: parseTags(body.tags) } : {}),
    ...(body.usageTags !== undefined ? { usageTags: parseUsageTags(body.usageTags) } : {}),
    ...(body.bpm !== undefined ? { bpm: parseOptionalInteger(body.bpm, "bpm", 20, 300) } : {}),
    ...(body.musicalKey !== undefined ? { musicalKey: normalizeOptionalString(body.musicalKey) } : {}),
    ...(body.visibility !== undefined ? { visibility: parseVisibility(body.visibility) } : {}),
    ...(body.status !== undefined ? { status: parseStatus(body.status) } : {}),
    ...(body.isFree !== undefined ? { isFree: parseBoolean(body.isFree, false) } : {}),
    ...(body.brandingRequired !== undefined ? { brandingRequired: parseBoolean(body.brandingRequired, false) } : {}),
    ...(body.audioAsset !== undefined ? { audioAsset: parseAsset(body.audioAsset, "audioAsset") } : {}),
    ...(body.thumbnailAsset !== undefined
      ? {
          thumbnailAsset:
            body.thumbnailAsset === null ? null : parseAsset(body.thumbnailAsset, "thumbnailAsset"),
        }
      : {}),
  };
}

/**
 * Parse les filtres publics de listing des beats.
 * @param url URL complete de la requete entrante.
 * @returns Query normalisee avec limites et tri bornes.
 */
export function parseBeatListQuery(url: URL): BeatListQuery {
  const bpm = parseOptionalInteger(url.searchParams.get("bpm"), "bpm", 20, 300);
  const bpmMin = parseOptionalInteger(url.searchParams.get("bpmMin"), "bpmMin", 20, 300);
  const bpmMax = parseOptionalInteger(url.searchParams.get("bpmMax"), "bpmMax", 20, 300);
  const priceMin = parseOptionalPrice(url.searchParams.get("priceMin"), "priceMin");
  const priceMax = parseOptionalPrice(url.searchParams.get("priceMax"), "priceMax");

  return {
    search: normalizeOptionalString(url.searchParams.get("search")) ?? undefined,
    genre: parseOptionalEnumParam(url.searchParams.get("genre"), "genre", allowedMainGenres),
    mood: parseOptionalEnumParam(url.searchParams.get("mood"), "mood", allowedMoods),
    bpm: bpm ?? undefined,
    bpmMin: bpmMin ?? undefined,
    bpmMax: bpmMax ?? undefined,
    key: normalizeOptionalString(url.searchParams.get("key")) ?? undefined,
    priceMin,
    priceMax,
    tags: parseTagListParam(url.searchParams.get("tags")),
    producer: normalizeOptionalString(url.searchParams.get("producer")) ?? undefined,
    sellerSlug: normalizeOptionalString(url.searchParams.get("sellerSlug")) ?? undefined,
    licenseType: parseLicenseType(url.searchParams.get("licenseType")),
    sort: parseSort(url.searchParams.get("sort")),
    limit: parsePositiveLimit(url.searchParams.get("limit"), 24, 50),
  };
}

/**
 * Parse la pagination publique du feed decouverte.
 * @param url URL complete de la requete entrante.
 */
export function parseBeatFeedQuery(url: URL): BeatFeedQuery {
  return {
    limit: parsePositiveLimit(url.searchParams.get("limit"), DEFAULT_FEED_LIMIT, MAX_FEED_LIMIT),
    cursor: parseFeedCursor(url.searchParams.get("cursor")),
  };
}
