import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "../../generated/prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
  prismaPool?: Pool;
};

/**
 * Lit l'URL PostgreSQL obligatoire pour Prisma.
 * @returns DATABASE_URL non vide.
 */
function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL in the runtime environment.");
  }

  return databaseUrl;
}

/**
 * Cree ou reutilise le pool PostgreSQL Prisma en developpement.
 * @returns Pool pg utilise par l'adapter Prisma.
 */
function getPrismaPool() {
  if (globalForPrisma.prismaPool) {
    return globalForPrisma.prismaPool;
  }

  const pool = new Pool({
    connectionString: getDatabaseUrl(),
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prismaPool = pool;
  }

  return pool;
}

/**
 * Retourne le client Prisma singleton de l'application.
 * @returns PrismaClient configure avec adapter PostgreSQL.
 */
export function getPrisma() {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg(getPrismaPool()),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
  }

  return prisma;
}
