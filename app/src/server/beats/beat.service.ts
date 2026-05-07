import "server-only";

import { syncCurrentAccountFromClerk } from "@/server/account/account.sync";
import { getPublicAssetUrl } from "@/server/storage/s3";

import type { AssetType } from "../../../generated/prisma/enums";
import {
  createBeat,
  findBeatPreviewJobForOwner,
  findPublishedBeatPreviewBySlug,
  findPublishedBeats,
  findVisibleBeatBySlug,
  resetBeatPreviewJobForOwner,
  softDeleteBeatBySlug,
  updateBeatBySlug,
} from "./beat.repository";
import type { BeatApiPayload, BeatListQuery, CreateBeatInput, UpdateBeatInput } from "./beat.types";

type BeatRecord = Awaited<ReturnType<typeof createBeat>>;

/**
 * Convertit un Decimal Prisma ou number en number nullable pour les payloads API.
 * @param value Montant Decimal, number ou null.
 */
function decimalToNumber(value: { toString(): string } | number | null) {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value.toString());
}

/**
 * Convertit un bigint Prisma en number nullable pour serialisation JSON.
 * @param value Taille ou compteur bigint, number ou null.
 */
function bigintToNumber(value: bigint | number | null) {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value);
}

/**
 * Verifie qu'une preview audio a bien ete produite par le worker interne.
 * @param asset Asset contenant metadataJson.
 */
function isWorkerGeneratedPreview(asset: { metadataJson: unknown }) {
  return (
    typeof asset.metadataJson === "object" &&
    asset.metadataJson !== null &&
    "generatedBy" in asset.metadataJson &&
    asset.metadataJson.generatedBy === "universe-audio-worker"
  );
}

/**
 * Transforme un beat Prisma en payload public avec URLs d'assets signees.
 * @param beat Beat charge avec owner et assets.
 * @returns Payload API consommable par les pages et clients.
 */
async function serializeBeat(beat: BeatRecord): Promise<BeatApiPayload> {
  const publicAssets = beat.assets.filter(({ role, asset }) => {
    if (!asset.isPublic || asset.processingStatus !== "READY") {
      return false;
    }

    return (
      role === "IMAGE_THUMBNAIL" ||
      (role === "AUDIO_PREVIEW" && isWorkerGeneratedPreview(asset))
    );
  });

  return {
    id: beat.id,
    slug: beat.slug,
    title: beat.title,
    description: beat.description,
    bpm: beat.bpm,
    musicalKey: beat.musicalKey,
    durationSec: beat.durationSec,
    priceAmount: decimalToNumber(beat.basePriceAmount),
    currency: beat.currency,
    primaryGenre: beat.primaryGenre,
    primaryMood: beat.primaryMood,
    tags: beat.tags,
    status: beat.status,
    visibility: beat.visibility,
    isFree: beat.isFree,
    brandingRequired: beat.brandingRequired,
    firstPublishedAt: beat.firstPublishedAt?.toISOString() ?? null,
    publishedAt: beat.publishedAt?.toISOString() ?? null,
    createdAt: beat.createdAt.toISOString(),
    updatedAt: beat.updatedAt.toISOString(),
    seller: {
      id: beat.owner.id,
      slug: beat.owner.profile?.slug ?? null,
      displayName: beat.owner.profile?.displayName ?? null,
    },
    assets: await Promise.all(
      publicAssets.map(async ({ role, asset }) => ({
        id: asset.id,
        role: role as AssetType,
        url: await getPublicAssetUrl({
          bucket: asset.bucket,
          objectKey: asset.objectKey,
          isPublic: asset.isPublic,
        }),
        originalFilename: asset.originalFilename,
        mimeType: asset.mimeType,
        sizeBytes: bigintToNumber(asset.sizeBytes),
      })),
    ),
  };
}

/**
 * Synchronise le compte courant et verifie qu'il correspond au Clerk user vendeur.
 * @param clerkUserId Identifiant Clerk attendu depuis auth().
 * @returns Compte local vendeur.
 */
async function assertSellerAccount(clerkUserId: string) {
  const account = await syncCurrentAccountFromClerk();

  if (account.clerkUserId !== clerkUserId) {
    throw new Error("account_not_found");
  }

  const roles = account.roles.map(({ role }) => role);

  if (!roles.includes("SELLER")) {
    throw new Error("seller_role_required");
  }

  return account;
}

/**
 * Cree un beat pour le vendeur authentifie.
 * @param clerkUserId Identifiant Clerk de la session.
 * @param input Donnees de creation validees.
 */
export async function createBeatForCurrentSeller(clerkUserId: string, input: CreateBeatInput) {
  const account = await assertSellerAccount(clerkUserId);

  return serializeBeat(await createBeat(account.id, input));
}

/**
 * Liste les beats publics sous forme de payloads API.
 * @param query Filtres catalogue valides.
 */
export async function listPublishedBeatsPayload(query: BeatListQuery) {
  const beats = await findPublishedBeats(query);

  return Promise.all(beats.map(serializeBeat));
}

/**
 * Retourne le detail d'un beat visible pour un visiteur donne.
 * @param slug Slug du beat.
 * @param viewerClerkUserId Identifiant Clerk du visiteur ou null.
 */
export async function getBeatPayloadBySlug(slug: string, viewerClerkUserId: string | null) {
  const result = await findVisibleBeatBySlug(slug, viewerClerkUserId);

  if (!result) {
    return null;
  }

  return {
    ...(await serializeBeat(result.beat)),
    viewer: {
      status: result.beat.status,
      visibility: result.beat.visibility,
      viewerCanEdit: result.viewerCanEdit,
    },
    licenseOfferings: result.beat.licenseOfferings.map((offering) => ({
      id: offering.id,
      title: offering.title ?? offering.licenseTemplate.name,
      description: offering.description,
      scope: offering.licenseTemplate.scope,
      priceAmount: decimalToNumber(offering.priceAmount),
      currency: offering.currency,
    })),
  };
}

/**
 * Retourne uniquement les informations necessaires a la lecture de preview.
 * @param slug Slug du beat public.
 */
export async function getBeatPreviewPayloadBySlug(slug: string) {
  const beat = await findPublishedBeatPreviewBySlug(slug);
  const preview = beat?.assets[0]?.asset;

  if (!beat || !preview || !isWorkerGeneratedPreview(preview)) {
    return null;
  }

  return {
    beat: {
      id: beat.id,
      slug: beat.slug,
      title: beat.title,
    },
    preview: {
      id: preview.id,
      url: await getPublicAssetUrl({
        bucket: preview.bucket,
        objectKey: preview.objectKey,
        isPublic: preview.isPublic,
      }),
      originalFilename: preview.originalFilename,
      mimeType: preview.mimeType,
      sizeBytes: bigintToNumber(preview.sizeBytes),
      delivery: "public_storage_reference" as const,
    },
  };
}

/**
 * Modifie un beat pour le vendeur authentifie.
 * @param clerkUserId Identifiant Clerk de la session.
 * @param slug Slug du beat a modifier.
 * @param input Patch valide.
 */
export async function updateBeatForCurrentSeller(
  clerkUserId: string,
  slug: string,
  input: UpdateBeatInput,
) {
  const account = await assertSellerAccount(clerkUserId);
  const beat = await updateBeatBySlug(account.id, slug, input);

  return beat ? serializeBeat(beat) : null;
}

/**
 * Supprime logiquement un beat appartenant au vendeur authentifie.
 * @param clerkUserId Identifiant Clerk de la session.
 * @param slug Slug du beat.
 */
export async function deleteBeatForCurrentSeller(clerkUserId: string, slug: string) {
  const account = await assertSellerAccount(clerkUserId);

  return softDeleteBeatBySlug(account.id, slug);
}

/**
 * Retourne l'etat du job de generation de preview pour un beat appartenant au
 * vendeur authentifie (audit B6 — alimente la UI vendeur). Renvoie null si le
 * beat n'a pas de job preview.
 */
export async function getBeatPreviewJobForCurrentSeller(
  clerkUserId: string,
  slug: string,
) {
  const account = await assertSellerAccount(clerkUserId);
  return findBeatPreviewJobForOwner(account.id, slug);
}

/**
 * Relance la generation de preview pour le beat du vendeur authentifie en
 * resetant le job (audit B6 volet 2). Utile lorsque le worker Rust a echoue
 * (timeout, ffmpeg KO, S3 down) ou s'est gele en PROCESSING (audit C7).
 */
export async function retryBeatPreviewForCurrentSeller(
  clerkUserId: string,
  slug: string,
) {
  const account = await assertSellerAccount(clerkUserId);
  return resetBeatPreviewJobForOwner(account.id, slug);
}

/**
 * Liste un echantillon de beats publics pour une page profil.
 * @param profileSlug Slug du profil vendeur.
 */
export async function listProfileBeatPayloads(profileSlug: string) {
  const beats = await findPublishedBeats({
    sellerSlug: profileSlug,
    sort: "newest",
    limit: 8,
  });

  return Promise.all(beats.map(serializeBeat));
}
