import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { syncCurrentAccountFromClerk } from "@/server/account/account.sync";
import { PRIVATE_JSON_HEADERS } from "@/server/http/response-headers";
import {
  createPresignedStorageUrl,
  createStorageObjectKey,
  getBeatStorageBucket,
} from "@/server/storage/s3";

type UploadKind =
  | "audio-source"
  | "audio-licensed-archive"
  | "image-thumbnail";

const allowedKinds = new Set<UploadKind>([
  "audio-source",
  "audio-licensed-archive",
  "image-thumbnail",
]);
const allowedAudioTypes = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "application/zip",
  "application/x-rar-compressed",
  "application/vnd.rar",
]);
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxAudioBytes = 250 * 1024 * 1024;
const maxImageBytes = 10 * 1024 * 1024;

export const dynamic = "force-dynamic";

/**
 * Exige une chaine non vide dans le payload de presign.
 * @param value Valeur brute.
 * @param field Nom logique du champ.
 */
function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field}_required`);
  }

  return value.trim();
}

/**
 * Valide la taille annoncee du fichier.
 * @param value Taille brute en octets.
 */
function requireSizeBytes(value: unknown) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("size_bytes_invalid");
  }

  return parsed;
}

/**
 * Valide une demande d'URL presignee d'upload vendeur.
 * @param payload Corps JSON brut contenant kind, filename, mimeType et sizeBytes.
 */
function parseUploadRequest(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("invalid_upload_payload");
  }

  const body = payload as Record<string, unknown>;
  const kind = requireString(body.kind, "kind") as UploadKind;
  const filename = requireString(body.filename, "filename");
  const mimeType = requireString(body.mimeType, "mime_type").toLowerCase();
  const sizeBytes = requireSizeBytes(body.sizeBytes);

  if (!allowedKinds.has(kind)) {
    throw new Error("upload_kind_invalid");
  }

  const isAudio =
    kind === "audio-source" ||
    kind === "audio-licensed-archive";
  const allowedMimeTypes = isAudio ? allowedAudioTypes : allowedImageTypes;
  const maxBytes = isAudio ? maxAudioBytes : maxImageBytes;

  if (!allowedMimeTypes.has(mimeType)) {
    throw new Error("mime_type_invalid");
  }

  if (sizeBytes > maxBytes) {
    throw new Error("file_too_large");
  }

  return { kind, filename, mimeType, sizeBytes };
}

/**
 * Extrait une extension de fichier normalisee.
 * @param filename Nom original du fichier.
 */
function extensionFromFilename(filename: string) {
  return filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || null;
}

/**
 * Convertit une erreur d'upload en reponse JSON privee.
 * @param error Erreur issue de validation ou d'autorisation.
 */
function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error.";
  const status =
    message === "seller_role_required"
      ? 403
      : message === "unauthorized"
        ? 401
        : 400;

  return NextResponse.json(
    {
      error: message,
      message,
    },
    {
      status,
      headers: PRIVATE_JSON_HEADERS,
    },
  );
}

/**
 * Cree une URL S3 presignee pour un upload de vendeur authentifie.
 * @param request Requete HTTP contenant les metadonnees du fichier a envoyer.
 */
export async function POST(request: Request) {
  const { isAuthenticated, userId } = await auth();

  if (!isAuthenticated || !userId) {
    return errorResponse(new Error("unauthorized"));
  }

  try {
    const account = await syncCurrentAccountFromClerk();
    const roles = account.roles.map(({ role }) => role);

    if (!roles.includes("SELLER")) {
      throw new Error("seller_role_required");
    }

    const input = parseUploadRequest(await request.json());
    const bucket = getBeatStorageBucket();
    const objectKey = createStorageObjectKey(input.kind, account.id, input.filename);
    const upload = await createPresignedStorageUrl({
      method: "PUT",
      bucket,
      objectKey,
      contentType: input.mimeType,
    });

    return NextResponse.json(
      {
        upload: {
          method: "PUT",
          url: upload.url,
          headers: upload.headers,
          expiresIn: upload.expiresIn,
        },
        asset: {
          bucket,
          objectKey,
          originalFilename: input.filename,
          mimeType: input.mimeType,
          extension: extensionFromFilename(input.filename),
          sizeBytes: input.sizeBytes,
        },
      },
      {
        status: 200,
        headers: PRIVATE_JSON_HEADERS,
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
