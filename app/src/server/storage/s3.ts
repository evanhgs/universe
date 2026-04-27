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

type UploadKind = "audio-source" | "audio-preview" | "image-thumbnail";

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
  "image-thumbnail": "beats/images",
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`missing_${name.toLowerCase()}`);
  }

  return value;
}

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

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodePath(value: string) {
  return value
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");
}

function formatAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function getSigningKey(secretAccessKey: string, date: string, region: string) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, date);
  const dateRegionKey = hmac(dateKey, region);
  const dateRegionServiceKey = hmac(dateRegionKey, "s3");

  return hmac(dateRegionServiceKey, "aws4_request");
}

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

function canonicalQuery(params: URLSearchParams) {
  return [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
}

export function getBeatStorageBucket() {
  return getStorageConfig().bucket;
}

export function createStorageObjectKey(kind: UploadKind, ownerId: string, filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";

  return `${uploadKindPrefixes[kind]}/${ownerId}/${randomUUID()}.${extension}`;
}

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

export async function getPublicAssetUrl(asset: {
  bucket: string;
  objectKey: string;
  isPublic?: boolean;
}) {
  if (!asset.isPublic) {
    return null;
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
