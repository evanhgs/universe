import { defineConfig } from "prisma/config";

import { databaseUrl } from "./src/lib/database-url";

const prismaConfig = {
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // seed: "tsx prisma/seed.ts" TODO: create a seed file
  },
  datasource: {
    url: databaseUrl,
  },
};

export default defineConfig(prismaConfig);
