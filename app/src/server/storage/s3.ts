import "server-only";

import { createHmac, createHash, randomUUID } from "node:crypto";

type PresignMethod = "GET" | "PUT";

type PresignOptions = {
  method: PresignMethod;
  bucket?: string;
  objectKey: string;
  contentType?: string;
  expiresIn?: number;
};

type UploadKind =
  | "audio-source"
  | "audio-preview"
  | "audio-licensed-archive"
  | "image-thumbnail";

type StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

const DEFAULT_REGION = "us-east-1";
const DEFAULT_UPLOAD_EXPIRES_IN = 300;
const DEFAULT_READ_EXPIRES_IN = 900;

const uploadKindPrefixes: Record<UploadKind, string> = {
  "audio-source": "beats/source",
  "audio-preview": "beats/preview",
  "audio-licensed-archive": "beats/licensed",
  "image-thumbnail": "beats/images",
};

/**
 * Lit une variable d'environnement obligatoire de configuration S3.
 * @param name Nom exact de la variable d'environnement.
 * @returns Valeur trimmee non vide.
 */
function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`missing_${name.toLowerCase()}`);
  }

  return value;
}

/**
 * Construit la configuration S3 seulement si toutes les variables publiques/secret sont disponibles.
 * @returns Configuration utilisable, ou null pour permettre un repli local.
 */
function optionalStorageConfig(): StorageConfig | null {
  const endpoint = process.env.S3_PUBLIC_ENDPOINT?.trim();
  const bucket = process.env.S3_BUCKET_BEATS?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    region: process.env.S3_REGION?.trim() || DEFAULT_REGION,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  };
}

/**
 * Charge la configuration S3 obligatoire pour signer les URLs.
 * @returns Configuration S3 complete.
 */
function getStorageConfig(): StorageConfig {
  return {
    endpoint: requireEnv("S3_PUBLIC_ENDPOINT"),
    bucket: requireEnv("S3_BUCKET_BEATS"),
    accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    region: process.env.S3_REGION?.trim() || DEFAULT_REGION,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  };
}

/**
 * Calcule un HMAC SHA-256 binaire pour la signature AWS v4.
 * @param key Cle de signature.
 * @param value Valeur a signer.
 */
function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

/**
 * Calcule un HMAC SHA-256 en hexadecimal pour la signature finale.
 * @param key Cle de signature.
 * @param value Valeur a signer.
 */
function hmacHex(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

/**
 * Calcule le hash SHA-256 hexadecimal d'une chaine canonique.
 * @param value Chaine a hasher.
 */
function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Encode une valeur selon RFC 3986 pour les chemins et query strings signees.
 * @param value Segment ou parametre a encoder.
 */
function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Encode chaque segment d'un chemin objet sans supprimer les separateurs.
 * @param value Chemin objet ou bucket.
 */
function encodePath(value: string) {
  return value
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");
}

/**
 * Formate une date au format compact attendu par AWS SigV4.
 * @param date Date de reference de la signature.
 */
function formatAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

/**
 * Derive la cle de signature AWS SigV4 pour S3.
 * @param secretAccessKey Secret S3.
 * @param date Date AAAAMMJJ.
 * @param region Region S3.
 */
function getSigningKey(secretAccessKey: string, date: string, region: string) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, date);
  const dateRegionKey = hmac(dateKey, region);
  const dateRegionServiceKey = hmac(dateRegionKey, "s3");

  return hmac(dateRegionServiceKey, "aws4_request");
}

/**
 * Construit l'URL objet en mode path-style ou virtual-hosted-style.
 * @param config Configuration S3.
 * @param bucket Bucket cible.
 * @param objectKey Cle objet S3.
 */
function buildObjectUrl(config: StorageConfig, bucket: string, objectKey: string) {
  const endpoint = new URL(config.endpoint);

  if (config.forcePathStyle) {
    endpoint.pathname = `/${encodePath(bucket)}/${encodePath(objectKey)}`;
    return endpoint;
  }

  endpoint.hostname = `${bucket}.${endpoint.hostname}`;
  endpoint.pathname = `/${encodePath(objectKey)}`;
  return endpoint;
}

/**
 * Canonicalise les parametres de query pour la signature AWS.
 * @param params Parametres d'URL a trier et encoder.
 */
function canonicalQuery(params: URLSearchParams) {
  return [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
}

/**
 * Retourne le bucket beat configure cote serveur.
 * @returns Nom du bucket S3 dedie aux assets beats.
 */
export function getBeatStorageBucket() {
  return getStorageConfig().bucket;
}

/**
 * Cree une cle objet non previsible pour un upload utilisateur.
 * @param kind Famille d'asset a stocker.
 * @param ownerId Identifiant utilisateur interne proprietaire.
 * @param filename Nom original utilise uniquement pour conserver l'extension.
 */
export function createStorageObjectKey(kind: UploadKind, ownerId: string, filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";

  return `${uploadKindPrefixes[kind]}/${ownerId}/${randomUUID()}.${extension}`;
}

/**
 * Genere une URL presignee S3 compatible SigV4 pour lire ou ecrire un objet.
 * @param options Methode, bucket optionnel, cle objet, type MIME et duree d'expiration.
 * @returns URL signee, expiration et headers a envoyer avec un PUT.
 */
export async function createPresignedStorageUrl(options: PresignOptions) {
  const config = getStorageConfig();
  const bucket = options.bucket ?? config.bucket;
  const expiresIn = options.expiresIn ?? DEFAULT_UPLOAD_EXPIRES_IN;
  const now = new Date();
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const url = buildObjectUrl(config, bucket, options.objectKey);
  const headers = new Map<string, string>([["host", url.host]]);

  if (options.method === "PUT" && options.contentType) {
    headers.set("content-type", options.contentType);
  }

  const signedHeaders = [...headers.keys()].sort().join(";");
  const canonicalHeaders = [...headers.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value.trim()}\n`)
    .join("");

  url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  url.searchParams.set("X-Amz-Credential", `${config.accessKeyId}/${credentialScope}`);
  url.searchParams.set("X-Amz-Date", amzDate);
  url.searchParams.set("X-Amz-Expires", String(expiresIn));
  url.searchParams.set("X-Amz-SignedHeaders", signedHeaders);

  const canonicalRequest = [
    options.method,
    url.pathname,
    canonicalQuery(url.searchParams),
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = hmacHex(
    getSigningKey(config.secretAccessKey, dateStamp, config.region),
    stringToSign,
  );

  url.searchParams.set("X-Amz-Signature", signature);

  return {
    url: url.toString(),
    expiresIn,
    headers:
      options.method === "PUT" && options.contentType
        ? { "Content-Type": options.contentType }
        : {},
  };
}

/**
 * Retourne une URL de lecture pour un asset public, avec repli local si S3 n'est pas configure.
 * @param asset Bucket, cle objet et indicateur isPublic de l'asset.
 * @returns URL temporaire, chemin local, ou null si l'asset n'est pas public.
 */
export async function getPublicAssetUrl(asset: {
  bucket: string;
  objectKey: string;
  isPublic?: boolean;
}) {
  if (!asset.isPublic) {
    return null;
  }

  if (/^https?:\/\//i.test(asset.objectKey)) {
    return asset.objectKey;
  }

  const config = optionalStorageConfig();

  if (!config) {
    return `/${asset.objectKey}`;
  }

  const bucket = asset.bucket || config.bucket;

  return createPresignedStorageUrl({
    method: "GET",
    bucket,
    objectKey: asset.objectKey,
    expiresIn: DEFAULT_READ_EXPIRES_IN,
  }).then((result) => result.url);
}

/**
 * Cree une URL temporaire de telechargement pour un asset protege.
 * @param asset Bucket, cle objet et expiration optionnelle.
 * @returns URL signee et duree de validite en secondes.
 */
export async function createProtectedAssetUrl(asset: {
  bucket: string;
  objectKey: string;
  expiresIn?: number;
}) {
  const result = await createPresignedStorageUrl({
    method: "GET",
    bucket: asset.bucket,
    objectKey: asset.objectKey,
    expiresIn: asset.expiresIn ?? DEFAULT_READ_EXPIRES_IN,
  });

  return {
    url: result.url,
    expiresIn: result.expiresIn,
  };
}
