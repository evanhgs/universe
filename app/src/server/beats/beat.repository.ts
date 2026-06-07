import "server-only";

import { getPrisma } from "@/lib/prisma";
import { createStorageObjectKey } from "@/server/storage/s3";

import { Prisma } from "../../../generated/prisma/client";
import {
  MainGenres,
  Moods,
  Tags,
  type AssetType,
  type LicenseScope,
  type MainGenres as MainGenre,
  type Moods as Mood,
  type ProcessingStatus,
  type Tags as Tag,
} from "../../../generated/prisma/enums";
import {
  BEAT_SLUG_PATTERN,
  DEFAULT_BASIC_LICENSE_CODE,
} from "./beat.constants";
import type {
  BeatAssetInput,
  BeatFeedQuery,
  BeatListQuery,
  CreateBeatInput,
  UpdateBeatInput,
} from "./beat.types";

const beatInclude = {
  owner: {
    select: {
      id: true,
      clerkUserId: true,
      profile: {
        select: {
          slug: true,
          displayName: true,
        },
      },
    },
  },
  assets: {
    orderBy: {
      sortOrder: "asc" as const,
    },
    include: {
      asset: true,
    },
  },
} as const;

const DUPLICATE_BEAT_ASSET_ERROR = "beat_asset_duplicate";
const searchableMainGenres = new Set<string>(Object.values(MainGenres));
const searchableMoods = new Set<string>(Object.values(Moods));
const searchableTags = new Set<string>(Object.values(Tags));

/**
 * Transforme un titre en slug beat compatible avec BEAT_SLUG_PATTERN.
 * @param value Titre libre fourni par le vendeur.
 * @returns Slug base, ou "beat" si le titre ne contient aucun caractere valide.
 */
function slugify(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return BEAT_SLUG_PATTERN.test(normalized) ? normalized : "beat";
}

/**
 * Genere un slug beat disponible en base a partir du titre.
 * @param title Titre public du beat.
 * @returns Slug unique, avec suffixe si necessaire.
 */
async function buildUniqueBeatSlug(title: string) {
  const prisma = getPrisma();
  const base = slugify(title);

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const existing = await prisma.beat.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!existing) {
      return slug;
    }
  }

  return `${base}-${Date.now()}`;
}

/**
 * Prepare les donnees Prisma de creation d'un media asset.
 * @param ownerId Identifiant utilisateur interne proprietaire.
 * @param asset Asset valide par la couche validation.
 * @param assetType Type metier de l'asset.
 * @param options Statut de traitement, visibilite et metadata optionnels.
 */
function mediaAssetCreate(
  ownerId: string,
  asset: BeatAssetInput,
  assetType: AssetType,
  options?: {
    processingStatus?: ProcessingStatus;
    isPublic?: boolean;
    metadataJson?: Prisma.InputJsonValue;
  },
) {
  return {
    ownerId,
    provider: "S3" as const,
    bucket: asset.bucket,
    objectKey: asset.objectKey,
    originalFilename: asset.originalFilename,
    mimeType: asset.mimeType,
    extension: asset.extension,
    sizeBytes:
      asset.sizeBytes === null || asset.sizeBytes === undefined
        ? null
        : BigInt(asset.sizeBytes),
    checksumSha256: asset.checksumSha256,
    assetType,
    processingStatus: options?.processingStatus ?? ("READY" as const),
    isPublic:
      options?.isPublic ?? (assetType === "IMAGE_THUMBNAIL" || assetType === "AUDIO_PREVIEW"),
    metadataJson: options?.metadataJson,
  };
}

/**
 * Detecte les collisions Prisma sur la cle unique objectKey.
 * @param error Erreur inconnue renvoyee par Prisma.
 */
function isObjectKeyUniqueConstraintError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }

  const target = error.meta?.target;

  return Array.isArray(target) && target.includes("objectKey");
}

/**
 * Refuse l'association d'objectKeys deja presents en base pour eviter la reutilisation d'uploads.
 * @param assets Assets candidats, nullables ou optionnels.
 */
async function assertMediaObjectKeysAvailable(assets: Array<BeatAssetInput | null | undefined>) {
  const objectKeys = assets
    .map((asset) => asset?.objectKey)
    .filter((objectKey): objectKey is string => Boolean(objectKey));
  const uniqueObjectKeys = new Set(objectKeys);

  if (uniqueObjectKeys.size === 0) {
    return;
  }

  const existingAsset = await getPrisma().mediaAsset.findFirst({
    where: { objectKey: { in: [...uniqueObjectKeys] } },
    select: { id: true },
  });

  if (existingAsset) {
    throw new Error(DUPLICATE_BEAT_ASSET_ERROR);
  }
}

/**
 * Retourne les valeurs par defaut d'un template de licence systeme.
 * @param scope Scope de licence demande.
 */
function licenseTemplateDefaults(scope: LicenseScope) {
  switch (scope) {
    case "BASIC":
      return {
        code: DEFAULT_BASIC_LICENSE_CODE,
        name: "MP3",
        description: "Licence avec fichier MP3.",
        allowCommercialUse: true,
        allowDistribution: false,
        allowStemsDownload: false,
      };
    case "PREMIUM":
      return {
        code: "premium",
        name: "WAV",
        description: "Licence avec fichier WAV haute qualite.",
        allowCommercialUse: true,
        allowDistribution: true,
        allowStemsDownload: false,
      };
    case "UNLIMITED":
      return {
        code: "unlimited",
        name: "Pistes separees",
        description: "Licence avec pack de pistes separees.",
        allowCommercialUse: true,
        allowDistribution: true,
        allowStemsDownload: true,
      };
    case "EXCLUSIVE":
      return {
        code: "exclusive",
        name: "Exclusive",
        description: "Licence exclusive avec transfert et pack complet.",
        allowCommercialUse: true,
        allowDistribution: true,
        allowStemsDownload: true,
      };
    case "CUSTOM":
      return {
        code: "custom",
        name: "Custom",
        description: "Licence personnalisee par le vendeur.",
        allowCommercialUse: true,
        allowDistribution: false,
        allowStemsDownload: false,
      };
  }
}

/**
 * Cree ou reactive le template de licence systeme associe a un scope.
 * @param scope Scope de licence a garantir en base.
 * @returns Identifiant du template actif.
 */
async function ensureLicenseTemplate(scope: LicenseScope) {
  const defaults = licenseTemplateDefaults(scope);

  return getPrisma().licenseTemplate.upsert({
    where: { code: defaults.code },
    update: { isActive: true },
    create: {
      code: defaults.code,
      name: defaults.name,
      scope,
      description: defaults.description,
      allowStreaming: true,
      allowCommercialUse: defaults.allowCommercialUse,
      allowDistribution: defaults.allowDistribution,
      allowStemsDownload: defaults.allowStemsDownload,
      allowExclusiveTransfer: scope === "EXCLUSIVE",
      isSystem: true,
      isActive: true,
    },
    select: { id: true },
  });
}

/**
 * Recalcule le compteur de beats publics d'un vendeur.
 * @param userId Identifiant utilisateur interne du vendeur.
 */
async function refreshSellerBeatCount(userId: string) {
  const prisma = getPrisma();
  const beatCount = await prisma.beat.count({
    where: {
      ownerId: userId,
      status: "PUBLISHED",
      visibility: "PUBLIC",
    },
  });

  await prisma.userProfile.update({
    where: { userId },
    data: { beatCount },
  });
}

/**
 * Cree un beat, ses assets, offres de licence et job de generation de preview dans une transaction.
 * @param ownerId Identifiant utilisateur interne du vendeur.
 * @param input Donnees de creation validees.
 * @returns Beat cree avec owner et assets charges.
 */
export async function createBeat(ownerId: string, input: CreateBeatInput) {
  const prisma = getPrisma();
  const licenseAssets = input.licenseOfferings.flatMap((offering) => offering.assets);
  await assertMediaObjectKeysAvailable([
    input.audioAsset,
    input.thumbnailAsset,
    ...licenseAssets.filter((asset) => asset.objectKey !== input.audioAsset.objectKey),
  ]);

  const slug = await buildUniqueBeatSlug(input.title);
  const licenseTemplateByScope = new Map(
    await Promise.all(
      Array.from(new Set(input.licenseOfferings.map((offering) => offering.scope))).map(
        async (scope) => [scope, await ensureLicenseTemplate(scope)] as const,
      ),
    ),
  );
  const createdStatus = input.publish ? "PROCESSING" : "DRAFT";

  const beat = await prisma.$transaction(async (tx) => {
    const createdBeat = await tx.beat.create({
      data: {
        ownerId,
        slug,
        title: input.title,
        description: input.description,
        bpm: input.bpm,
        musicalKey: input.musicalKey,
        basePriceAmount: input.priceAmount,
        currency: input.currency,
        mainGenres: input.mainGenres,
        secondGenres: input.secondGenres,
        moods: input.moods,
        tags: input.tags,
        usageTags: input.usageTags,
        status: createdStatus,
        visibility: input.visibility,
        isFree: input.isFree,
        brandingRequired: input.brandingRequired,
        firstPublishedAt: null,
        publishedAt: null,
      },
      select: { id: true },
    });

    const audioAsset = await tx.mediaAsset.create({
      data: mediaAssetCreate(ownerId, input.audioAsset, "AUDIO_SOURCE", {
        isPublic: false,
      }),
      select: { id: true, objectKey: true },
    });

    const assetByObjectKey = new Map([[audioAsset.objectKey, audioAsset]]);

    for (const offeringInput of input.licenseOfferings) {
      const licenseTemplate = licenseTemplateByScope.get(offeringInput.scope);

      if (!licenseTemplate) {
        throw new Error("license_template_not_found");
      }

      const offering = await tx.beatLicenseOffering.create({
        data: {
          beatId: createdBeat.id,
          licenseTemplateId: licenseTemplate.id,
          sellerId: ownerId,
          title: offeringInput.title ?? licenseTemplateDefaults(offeringInput.scope).name,
          description: offeringInput.description,
          priceAmount: offeringInput.priceAmount,
          currency: offeringInput.currency,
          isDefault: offeringInput.isDefault,
          deliveryNotes: offeringInput.deliveryNotes,
        },
        select: { id: true },
      });

      for (const [index, deliveryAssetInput] of offeringInput.assets.entries()) {
        let deliveryAsset = assetByObjectKey.get(deliveryAssetInput.objectKey);
        const role: AssetType =
          deliveryAssetInput.objectKey === input.audioAsset.objectKey
            ? "AUDIO_SOURCE"
            : "AUDIO_LICENSED_ARCHIVE";

        if (!deliveryAsset) {
          deliveryAsset = await tx.mediaAsset.create({
            data: mediaAssetCreate(ownerId, deliveryAssetInput, "AUDIO_LICENSED_ARCHIVE", {
              isPublic: false,
            }),
            select: { id: true, objectKey: true },
          });
          assetByObjectKey.set(deliveryAsset.objectKey, deliveryAsset);
        }

        await tx.beatAssetLink.create({
          data: {
            beatId: createdBeat.id,
            assetId: deliveryAsset.id,
            role,
            licenseOfferingId: offering.id,
            sortOrder: index,
          },
        });
      }
    }

    const previewObjectKey = createStorageObjectKey(
      "audio-preview",
      ownerId,
      `${slug}-preview.mp3`,
    );
    const previewAsset = await tx.mediaAsset.create({
      data: mediaAssetCreate(
        ownerId,
        {
          bucket: input.audioAsset.bucket,
          objectKey: previewObjectKey,
          originalFilename: `${slug}-preview.mp3`,
          mimeType: "audio/mpeg",
          extension: "mp3",
          sizeBytes: null,
        },
        "AUDIO_PREVIEW",
        {
          processingStatus: "PENDING",
          isPublic: true,
          metadataJson: {
            generatedFromAssetId: audioAsset.id,
            publishWhenReady: input.publish,
          },
        },
      ),
      select: { id: true },
    });

    await tx.beatAssetLink.create({
      data: {
        beatId: createdBeat.id,
        assetId: previewAsset.id,
        role: "AUDIO_PREVIEW",
        sortOrder: 1,
      },
    });

    await tx.audioProcessingJob.create({
      data: {
        beatId: createdBeat.id,
        sourceAssetId: audioAsset.id,
        outputAssetId: previewAsset.id,
        type: "PREVIEW_GENERATION",
        status: "PENDING",
        payloadJson: {
          publishWhenReady: input.publish,
          previewPolicy: {
            longSourceThresholdSec: 60,
            longPreviewSec: 30,
            shortPreviewSec: 10,
            bitrateKbps: 96,
            fadeSec: 1,
          },
        },
      },
    });

    if (input.thumbnailAsset) {
      const thumbnailAsset = await tx.mediaAsset.create({
        data: mediaAssetCreate(ownerId, input.thumbnailAsset, "IMAGE_THUMBNAIL"),
        select: { id: true },
      });

      await tx.beatAssetLink.create({
        data: {
          beatId: createdBeat.id,
          assetId: thumbnailAsset.id,
          role: "IMAGE_THUMBNAIL",
          sortOrder: 1,
        },
      });
    }

    return tx.beat.findUniqueOrThrow({
      where: { id: createdBeat.id },
      include: beatInclude,
    });
  }).catch((error: unknown) => {
    if (isObjectKeyUniqueConstraintError(error)) {
      throw new Error(DUPLICATE_BEAT_ASSET_ERROR);
    }

    throw error;
  });

  await refreshSellerBeatCount(ownerId);

  return beat;
}

/**
 * Liste les beats publics en appliquant les filtres de catalogue.
 * @param query Filtres et tri deja valides par parseBeatListQuery.
 * @returns Beats publics visibles et propres moderation.
 */
export async function findPublishedBeats(query: BeatListQuery) {
  const ownerProfileFilters: Prisma.UserProfileWhereInput[] = [];

  if (query.producer) {
    ownerProfileFilters.push({
      OR: [
        { slug: { equals: query.producer, mode: "insensitive" } },
        { displayName: { contains: query.producer, mode: "insensitive" } },
      ],
    });
  }

  if (query.sellerSlug) {
    ownerProfileFilters.push({
      slug: { equals: query.sellerSlug, mode: "insensitive" },
    });
  }

  const orderBy =
    query.sort === "price_asc"
      ? [{ basePriceAmount: "asc" as const }, { publishedAt: "desc" as const }]
      : query.sort === "price_desc"
        ? [{ basePriceAmount: "desc" as const }, { publishedAt: "desc" as const }]
        : query.sort === "bpm_asc"
          ? [{ bpm: "asc" as const }, { publishedAt: "desc" as const }]
          : query.sort === "bpm_desc"
            ? [{ bpm: "desc" as const }, { publishedAt: "desc" as const }]
            : [{ publishedAt: "desc" as const }, { createdAt: "desc" as const }];
  const normalizedSearch = query.search?.trim().toUpperCase();
  const searchGenre = normalizedSearch && searchableMainGenres.has(normalizedSearch)
    ? (normalizedSearch as MainGenre)
    : null;
  const searchMood = normalizedSearch && searchableMoods.has(normalizedSearch)
    ? (normalizedSearch as Mood)
    : null;
  const searchTag = normalizedSearch && searchableTags.has(normalizedSearch)
    ? (normalizedSearch as Tag)
    : null;

  return getPrisma().beat.findMany({
    where: {
      status: "PUBLISHED",
      visibility: "PUBLIC",
      moderationStatus: "CLEAN",
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } },
              ...(searchGenre ? [{ mainGenres: { has: searchGenre } }] : []),
              ...(searchMood ? [{ moods: { has: searchMood } }] : []),
              ...(searchTag ? [{ tags: { has: searchTag } }] : []),
            ],
          }
        : {}),
      ...(query.genre
        ? { mainGenres: { has: query.genre } }
        : {}),
      ...(query.mood
        ? { moods: { has: query.mood } }
        : {}),
      ...(query.bpm ? { bpm: query.bpm } : {}),
      ...(query.bpmMin !== undefined || query.bpmMax !== undefined
        ? {
            bpm: {
              ...(query.bpmMin !== undefined ? { gte: query.bpmMin } : {}),
              ...(query.bpmMax !== undefined ? { lte: query.bpmMax } : {}),
            },
          }
        : {}),
      ...(query.key
        ? { musicalKey: { contains: query.key, mode: "insensitive" } }
        : {}),
      ...(query.priceMin !== undefined || query.priceMax !== undefined
        ? {
            basePriceAmount: {
              ...(query.priceMin !== undefined ? { gte: query.priceMin } : {}),
              ...(query.priceMax !== undefined ? { lte: query.priceMax } : {}),
            },
          }
        : {}),
      ...(query.tags ? { tags: { hasEvery: query.tags } } : {}),
      ...(ownerProfileFilters.length > 0
        ? { owner: { profile: { AND: ownerProfileFilters } } }
        : {}),
      ...(query.licenseType
        ? {
            licenseOfferings: {
              some: {
                isActive: true,
                licenseTemplate: { scope: query.licenseType, isActive: true },
              },
            },
          }
        : {}),
    },
    orderBy,
    take: query.limit,
    include: beatInclude,
  });
}

/**
 * Liste une page de beats pour le feed decouverte avec pagination par curseur.
 * @param query Limite et curseur deja valides.
 * @returns Une page limite+1 pour detecter s'il reste des resultats.
 */
export async function findPublishedFeedBeats(query: BeatFeedQuery) {
  const cursorDate = query.cursor ? new Date(query.cursor.publishedAt) : null;

  return getPrisma().beat.findMany({
    where: {
      status: "PUBLISHED",
      visibility: "PUBLIC",
      moderationStatus: "CLEAN",
      publishedAt: { not: null },
      ...(query.cursor && cursorDate
        ? {
            OR: [
              { publishedAt: { lt: cursorDate } },
              {
                publishedAt: cursorDate,
                id: { lt: query.cursor.id },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    include: beatInclude,
  });
}

/**
 * Charge la preview audio publique d'un beat publie.
 * @param slug Slug public du beat.
 * @returns Beat minimal avec asset preview pret, ou null.
 */
export async function findPublishedBeatPreviewBySlug(slug: string) {
  return getPrisma().beat.findFirst({
    where: {
      slug,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      moderationStatus: "CLEAN",
    },
    select: {
      id: true,
      slug: true,
      title: true,
      assets: {
        where: {
          role: "AUDIO_PREVIEW",
          asset: {
            isPublic: true,
            processingStatus: "READY",
          },
        },
        orderBy: {
          sortOrder: "asc",
        },
        take: 1,
        select: {
          asset: true,
        },
      },
    },
  });
}

/**
 * Charge un beat visible pour le visiteur, en autorisant le proprietaire a voir ses brouillons.
 * @param slug Slug public du beat.
 * @param viewerClerkUserId Identifiant Clerk du visiteur, ou null pour anonyme.
 * @returns Beat et droit edition du visiteur, ou null si inaccessible.
 */
export async function findVisibleBeatBySlug(slug: string, viewerClerkUserId: string | null) {
  const beat = await getPrisma().beat.findUnique({
    where: { slug },
    include: {
      ...beatInclude,
      licenseOfferings: {
        where: { isActive: true },
        orderBy: [{ isDefault: "desc" }, { priceAmount: "asc" }],
        select: {
          id: true,
          title: true,
          description: true,
          priceAmount: true,
          currency: true,
          licenseTemplate: {
            select: {
              scope: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!beat || beat.status === "DELETED") {
    return null;
  }

  const viewerCanEdit =
    viewerClerkUserId !== null && beat.owner.clerkUserId === viewerClerkUserId;

  if (!viewerCanEdit && (beat.status !== "PUBLISHED" || beat.visibility !== "PUBLIC")) {
    return null;
  }

  return { beat, viewerCanEdit };
}

/**
 * Modifie un beat appartenant au vendeur et remplace certains assets si demandes.
 * @param ownerId Identifiant utilisateur interne du vendeur.
 * @param slug Slug du beat a modifier.
 * @param input Patch valide par parseUpdateBeatInput.
 * @returns Beat mis a jour, null si inexistant.
 */
export async function updateBeatBySlug(ownerId: string, slug: string, input: UpdateBeatInput) {
  const prisma = getPrisma();

  const existing = await prisma.beat.findUnique({
    where: { slug },
    select: { id: true, ownerId: true, firstPublishedAt: true },
  });

  if (!existing) {
    return null;
  }

  if (existing.ownerId !== ownerId) {
    throw new Error("beat_forbidden");
  }

  const publishedAt = input.status === "PUBLISHED" ? new Date() : undefined;
  const priceAmount = input.isFree ? 0 : input.priceAmount;
  await assertMediaObjectKeysAvailable([
    input.audioAsset,
    input.thumbnailAsset,
  ]);

  const beat = await prisma.$transaction(async (tx) => {
    const updated = await tx.beat.update({
      where: { id: existing.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(priceAmount !== undefined ? { basePriceAmount: priceAmount } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.mainGenres !== undefined ? { mainGenres: input.mainGenres } : {}),
        ...(input.secondGenres !== undefined ? { secondGenres: input.secondGenres } : {}),
        ...(input.moods !== undefined ? { moods: input.moods } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.usageTags !== undefined ? { usageTags: input.usageTags } : {}),
        ...(input.bpm !== undefined ? { bpm: input.bpm } : {}),
        ...(input.musicalKey !== undefined ? { musicalKey: input.musicalKey } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        ...(input.status !== undefined
          ? {
              status: input.status,
              publishedAt: input.status === "PUBLISHED" ? publishedAt : null,
              firstPublishedAt:
                input.status === "PUBLISHED" && !existing.firstPublishedAt
                  ? publishedAt
                  : undefined,
            }
          : {}),
        ...(input.isFree !== undefined ? { isFree: input.isFree } : {}),
        ...(input.brandingRequired !== undefined
          ? { brandingRequired: input.brandingRequired }
          : {}),
      },
      select: { id: true },
    });

    if (priceAmount !== undefined || input.currency !== undefined) {
      await tx.beatLicenseOffering.updateMany({
        where: {
          beatId: updated.id,
          isDefault: true,
        },
        data: {
          ...(priceAmount !== undefined ? { priceAmount } : {}),
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
        },
      });
    }

    if (input.audioAsset) {
      const audioAsset = await tx.mediaAsset.create({
        data: mediaAssetCreate(ownerId, input.audioAsset, "AUDIO_SOURCE", {
          isPublic: false,
        }),
        select: { id: true },
      });
      const defaultOffering = await tx.beatLicenseOffering.findFirst({
        where: {
          beatId: updated.id,
          isDefault: true,
        },
        select: { id: true },
      });

      await tx.beatAssetLink.deleteMany({
        where: { beatId: updated.id, role: "AUDIO_SOURCE" },
      });
      await tx.beatAssetLink.create({
        data: {
          beatId: updated.id,
          assetId: audioAsset.id,
          role: "AUDIO_SOURCE",
          licenseOfferingId: defaultOffering?.id,
        },
      });
    }

    if (input.thumbnailAsset !== undefined) {
      await tx.beatAssetLink.deleteMany({
        where: { beatId: updated.id, role: "IMAGE_THUMBNAIL" },
      });

      if (input.thumbnailAsset) {
        const thumbnailAsset = await tx.mediaAsset.create({
          data: mediaAssetCreate(ownerId, input.thumbnailAsset, "IMAGE_THUMBNAIL"),
          select: { id: true },
        });

        await tx.beatAssetLink.create({
          data: {
            beatId: updated.id,
            assetId: thumbnailAsset.id,
            role: "IMAGE_THUMBNAIL",
            sortOrder: 1,
          },
        });
      }
    }

    return tx.beat.findUniqueOrThrow({
      where: { id: updated.id },
      include: beatInclude,
    });
  }).catch((error: unknown) => {
    if (isObjectKeyUniqueConstraintError(error)) {
      throw new Error(DUPLICATE_BEAT_ASSET_ERROR);
    }

    throw error;
  });

  await refreshSellerBeatCount(ownerId);

  return beat;
}

/**
 * Periode au-dela de laquelle un job PREVIEW_GENERATION encore en PROCESSING
 * est considere comme gele (worker mort entre claim et completion). Un job
 * gele est eligible au retry meme si son statut n'est pas FAILED. Coherent
 * avec la recommandation C7 de l'audit.
 */
const STALE_PROCESSING_LOCK_MS = 5 * 60 * 1000;

/**
 * Etat courant du job de generation de preview pour un beat appartenant
 * au vendeur. Permet a l'UI de decider entre "attendre", "relancer" ou
 * "uploader manuellement" (audit B6, volet 3 — sera consomme par le dashboard).
 */
export type BeatPreviewJobState = {
  jobId: string;
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  attempts: number;
  maxAttempts: number;
  lockedAt: Date | null;
  failedAt: Date | null;
  errorMessage: string | null;
  isStale: boolean;
  canRetry: boolean;
  outputAssetStatus: "PENDING" | "PROCESSING" | "READY" | "FAILED";
};

/**
 * Retourne l'etat du dernier job PREVIEW_GENERATION pour le beat appartenant
 * au vendeur. Retourne null si le beat ou son job n'existe pas.
 * @throws "beat_forbidden" si le slug n'appartient pas a `ownerId`.
 */
export async function findBeatPreviewJobForOwner(
  ownerId: string,
  slug: string,
): Promise<BeatPreviewJobState | null> {
  const prisma = getPrisma();
  const beat = await prisma.beat.findUnique({
    where: { slug },
    select: { id: true, ownerId: true },
  });

  if (!beat) {
    return null;
  }
  if (beat.ownerId !== ownerId) {
    throw new Error("beat_forbidden");
  }

  const job = await prisma.audioProcessingJob.findFirst({
    where: { beatId: beat.id, type: "PREVIEW_GENERATION" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      attempts: true,
      maxAttempts: true,
      lockedAt: true,
      failedAt: true,
      errorMessage: true,
      outputAsset: { select: { processingStatus: true } },
    },
  });

  if (!job) {
    return null;
  }

  const isStale =
    job.status === "PROCESSING" &&
    job.lockedAt !== null &&
    Date.now() - job.lockedAt.getTime() > STALE_PROCESSING_LOCK_MS;
  const canRetry = job.status === "FAILED" || isStale;

  return {
    jobId: job.id,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    lockedAt: job.lockedAt,
    failedAt: job.failedAt,
    errorMessage: job.errorMessage,
    isStale,
    canRetry,
    outputAssetStatus: job.outputAsset.processingStatus,
  };
}

/**
 * Reinitialise le job de generation de preview d'un beat pour relance par le
 * worker Rust (audit B6, volet 2). Autorise si le job est FAILED ou si son
 * verrou PROCESSING est obsolete (worker mort, voir C7).
 *
 * Effets :
 *  - AudioProcessingJob: status=PENDING, attempts=0, lockedAt/lockedBy/errorMessage null
 *  - MediaAsset (outputAsset): processingStatus=PENDING (efface l'erreur precedente)
 *  - Beat: si DRAFT (suite a un echec terminal), repasse en PROCESSING pour
 *    permettre au worker de republier sur succes
 *
 * @throws "beat_not_found", "beat_forbidden",
 *         "beat_preview_job_missing", "beat_preview_job_not_retryable"
 */
export async function resetBeatPreviewJobForOwner(
  ownerId: string,
  slug: string,
): Promise<BeatPreviewJobState> {
  const prisma = getPrisma();

  const jobId = await prisma.$transaction(async (tx) => {
    const beat = await tx.beat.findUnique({
      where: { slug },
      select: { id: true, ownerId: true, status: true },
    });

    if (!beat) {
      throw new Error("beat_not_found");
    }
    if (beat.ownerId !== ownerId) {
      throw new Error("beat_forbidden");
    }

    const job = await tx.audioProcessingJob.findFirst({
      where: { beatId: beat.id, type: "PREVIEW_GENERATION" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        lockedAt: true,
        outputAssetId: true,
      },
    });

    if (!job) {
      throw new Error("beat_preview_job_missing");
    }

    const isStale =
      job.status === "PROCESSING" &&
      job.lockedAt !== null &&
      Date.now() - job.lockedAt.getTime() > STALE_PROCESSING_LOCK_MS;
    const canRetry = job.status === "FAILED" || isStale;

    if (!canRetry) {
      throw new Error("beat_preview_job_not_retryable");
    }

    await tx.audioProcessingJob.update({
      where: { id: job.id },
      data: {
        status: "PENDING",
        attempts: 0,
        lockedAt: null,
        lockedBy: null,
        errorMessage: null,
        failedAt: null,
        completedAt: null,
      },
    });

    await tx.mediaAsset.update({
      where: { id: job.outputAssetId },
      data: { processingStatus: "PENDING" },
    });

    if (beat.status === "DRAFT") {
      await tx.beat.update({
        where: { id: beat.id },
        data: { status: "PROCESSING" },
      });
    }

    return job.id;
  });

  const refreshed = await findBeatPreviewJobForOwner(ownerId, slug);
  if (!refreshed || refreshed.jobId !== jobId) {
    throw new Error("beat_preview_job_missing");
  }
  return refreshed;
}

/**
 * Supprime logiquement un beat en le rendant prive et DELETED.
 * @param ownerId Identifiant utilisateur interne du vendeur.
 * @param slug Slug du beat a supprimer.
 * @returns true si une suppression a ete appliquee, false si le beat est absent/deja supprime.
 */
export async function softDeleteBeatBySlug(ownerId: string, slug: string) {
  const prisma = getPrisma();

  const existing = await prisma.beat.findUnique({
    where: { slug },
    select: { id: true, ownerId: true, status: true },
  });

  if (!existing || existing.status === "DELETED") {
    return false;
  }

  if (existing.ownerId !== ownerId) {
    throw new Error("beat_forbidden");
  }

  await prisma.beat.update({
    where: { id: existing.id },
    data: {
      status: "DELETED",
      visibility: "PRIVATE",
      archivedAt: new Date(),
    },
  });

  await refreshSellerBeatCount(ownerId);

  return true;
}
