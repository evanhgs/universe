import { defineConfig } from "prisma/config";

const prismaConfig = {
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // seed: "tsx prisma/seed.ts" TODO: create a seed file
  },
  datasource: {
    // `generate` runs during image builds where DATABASE_URL is not injected yet.
    // Commands that actually talk to the database still require DATABASE_URL.
    url: process.env.DATABASE_URL ?? "",
  },
};

export default defineConfig(prismaConfig);
