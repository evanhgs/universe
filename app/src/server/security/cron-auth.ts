import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

import { getClientIp } from "@/server/security/rate-limit";

const SIGNATURE_PREFIX = "sha256=";
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

type CidrRange = {
  base: number;
  mask: number;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name.toLowerCase()}_not_configured`);
  }

  return value;
}

function ipv4ToNumber(value: string) {
  const parts = value.split(".");

  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }

  const bytes = parts.map(Number);

  if (bytes.some((byte) => byte < 0 || byte > 255)) {
    return null;
  }

  return bytes.reduce((acc, byte) => (acc << 8) + byte, 0) >>> 0;
}

function parseCidr(value: string): CidrRange | null {
  const [address, prefixRaw] = value.split("/");
  const base = ipv4ToNumber(address);
  const prefix = Number(prefixRaw);

  if (base === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return null;
  }

  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;

  return { base: base & mask, mask };
}

function ipMatchesAllowedEntry(ip: string, entry: string) {
  if (entry.includes("/")) {
    const range = parseCidr(entry);
    const ipNumber = ipv4ToNumber(ip);

    return range !== null && ipNumber !== null && (ipNumber & range.mask) === range.base;
  }

  return ip === entry;
}

function assertIpAllowed(request: Request) {
  const allowedIps = requireEnv("CRON_ALLOWED_IPS")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (allowedIps.length === 0) {
    throw new Error("cron_allowed_ips_not_configured");
  }

  const ip = getClientIp(request);

  if (ip === "unknown" || !isIP(ip)) {
    throw new Error("cron_ip_forbidden");
  }

  if (!allowedIps.some((entry) => ipMatchesAllowedEntry(ip, entry))) {
    throw new Error("cron_ip_forbidden");
  }
}

function assertFreshTimestamp(request: Request) {
  const timestamp = request.headers.get("x-cron-timestamp")?.trim();

  if (!timestamp) {
    throw new Error("cron_timestamp_missing");
  }

  const parsed = Number(timestamp);

  if (!Number.isInteger(parsed)) {
    throw new Error("cron_timestamp_invalid");
  }

  const timestampMs = parsed > 10_000_000_000 ? parsed : parsed * 1000;

  if (Math.abs(Date.now() - timestampMs) > MAX_CLOCK_SKEW_MS) {
    throw new Error("cron_timestamp_expired");
  }

  return String(parsed);
}

function assertValidSignature(request: Request, timestamp: string) {
  const secret = requireEnv("CRON_SECRET");
  const signature = request.headers.get("x-cron-signature")?.trim();

  if (!signature?.startsWith(SIGNATURE_PREFIX)) {
    throw new Error("cron_signature_missing");
  }

  const actual = Buffer.from(signature.slice(SIGNATURE_PREFIX.length), "hex");
  const expected = Buffer.from(
    createHmac("sha256", secret)
      .update(`${request.method}\n${new URL(request.url).pathname}\n${timestamp}`)
      .digest("hex"),
    "hex",
  );

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("cron_signature_invalid");
  }
}

export function assertCronRequestAuthorized(request: Request) {
  assertIpAllowed(request);
  const timestamp = assertFreshTimestamp(request);
  assertValidSignature(request, timestamp);
}
