/**
 * Prisma client singleton.
 *
 * Next.js hot-reload creates new module instances in development, which
 * would exhaust the Postgres connection pool if we naively instantiated
 * PrismaClient at module level. The global singleton pattern prevents this.
 *
 * In production (NODE_ENV=production), no global caching is needed because
 * the module is only evaluated once per process lifetime.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
