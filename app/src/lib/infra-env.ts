import * as fs from "node:fs";
import * as path from "node:path";
import * as dotenv from "dotenv";

type AppEnv = "development" | "staging";

function resolveAppEnv(): AppEnv {
  return process.env.APP_ENV === "staging" ? "staging" : "development";
}

function resolveEnvDirectory() {
  const candidates = [
    path.resolve(process.cwd(), "../infra/env"),
    path.resolve(process.cwd(), "infra/env"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function isRunningInDocker() {
  return fs.existsSync("/.dockerenv");
}

function normalizeHostDatabaseUrl() {
  if (resolveAppEnv() !== "development" || isRunningInDocker()) {
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return;
  }

  const parsedUrl = new URL(databaseUrl);

  if (parsedUrl.hostname !== "postgres") {
    return;
  }

  parsedUrl.hostname = "localhost";

  if (process.env.POSTGRES_PORT) {
    parsedUrl.port = process.env.POSTGRES_PORT;
  }

  process.env.DATABASE_URL = parsedUrl.toString();
}

export function loadInfraEnv() {
  const envDirectory = resolveEnvDirectory();

  if (!envDirectory) {
    return;
  }

  const appEnv = resolveAppEnv();
  const fileStem = appEnv === "staging" ? "stack.staging.env" : "stack.dev.env";
  const fileCandidates = [
    path.join(envDirectory, fileStem),
    path.join(envDirectory, `${fileStem}.example`),
  ];

  const envFile = fileCandidates.find((candidate) => fs.existsSync(candidate));

  if (!envFile) {
    return;
  }

  dotenv.config({
    path: envFile,
    override: true,
  });

  normalizeHostDatabaseUrl();
}
