import { loadInfraEnv } from "./infra-env";

loadInfraEnv();

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "Missing DATABASE_URL. Define it in infra/env for the current APP_ENV or inject it at runtime.",
    );
  }

  return databaseUrl;
}

export const databaseUrl = getDatabaseUrl();
