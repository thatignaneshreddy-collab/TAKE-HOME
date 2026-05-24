/**
 * InventoryService — the concurrency-critical core of this system.
 *
 * ══════════════════════════════════════════════════════════════════
 * CONCURRENCY STRATEGY
 * ══════════════════════════════════════════════════════════════════
 *
 * The fundamental problem: two requests arriving simultaneously for
 * the last unit of inventory. A naive read-then-write approach:
 *
 *   // WRONG — race condition
 *   const inv = await prisma.inventory.findUnique(...)
 *   if (inv.totalStock - inv.reservedStock >= qty) {
 *     await prisma.inventory.update({ reservedStock: { increment: qty } })
 *   }
 *
 * fails because both requests can read the same snapshot before
 * either write commits. Both see "1 available", both proceed, and
 * we've oversold.
 *
 * The correct approach is an ATOMIC CONDITIONAL UPDATE:
 *
 *   UPDATE inventory
 *   SET reserved_stock = reserved_stock + qty
 *   WHERE product_id = ?
 *     AND warehouse_id = ?
 *     AND (total_stock - reserved_stock) >= qty
 *
 * PostgreSQL evaluates the WHERE clause and applies the SET in a
 * single atomic operation under row-level locking. If two requests
 * race:
 *   - Request A acquires row lock, WHERE passes, update succeeds → 1 row affected
 *   - Request B waits, acquires lock, re-evaluates WHERE (now fails), → 0 rows affected
 *
 * The affected row count is the authoritative signal:
 *   1 → stock was available, reservation proceeds
 *   0 → insufficient stock, return 409
 *
 * This is production-grade, scales to thousands of concurrent requests,
 * and requires no distributed locking infrastructure.
 *
 * ══════════════════════════════════════════════════════════════════
 * EXPIRY STRATEGY
 * ══════════════════════════════════════════════════════════════════
 *
 * Reservations expire after RESERVATION_TTL_MINUTES minutes.
 * Expiry is enforced lazily (before hot operations) and via a
 * periodic cron endpoint. There are NO in-memory timers.
 *
 * Lazy cleanup runs inside the same transaction as the operation
 * that triggered it, so expired stock is always freed before new
 * reservations are evaluated — preventing starvation.
 */

import { prisma } from "@/lib/db/prisma";
import { redisDel, redisGetJson, redisSetJson } from "@/lib/redis";
import { Prisma, ReservationStatus } from "@prisma/client";
import crypto from "crypto";

export const RESERVATION_TTL_MINUTES = 15;
const PRODUCTS_INVENTORY_CACHE_KEY = "inventory:products:v1";
const PRODUCTS_INVENTORY_CACHE_TTL_SECONDS = 5;

// ── Types ─────────────────────────────────────────────────────────────────

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; statusCode: number };

export interface ReservationWithRelations {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  product: { id: string; name: string; sku: string };
  warehouse: { id: string; name: string; location: string };
}

// ── Expiry helpers ────────────────────────────────────────────────────────

/**
 * Releases all pending reservations that have passed their expiresAt.
 * Must be called INSIDE a transaction to be atomic with the calling operation.
 *
 * We use WHERE status = 'pending' explicitly — never touch confirmed/released.
 * The return value is the count of released reservations.
 */
async function releaseExpiredReservations(
  tx: Prisma.TransactionClient
): Promise<number> {
  const now = new Date();

  // Find expired pending reservations with a lock to prevent race with
  // concurrent confirm/release operations
  const expired = await tx.$queryRaw<{ id: string; productId: string; warehouseId: string; quantity: number }[]>`
    SELECT r.id, r."productId", r."warehouseId", r.quantity
    FROM "Reservation" r
    WHERE r.status = 'pending'
      AND r."expiresAt" < ${now}
    FOR UPDATE SKIP LOCKED
  `;

  if (expired.length === 0) return 0;

  // Return each expired reservation's stock atomically
  for (const res of expired) {
    // Decrement reservedStock — this is safe because:
    // 1. We hold a row lock on the reservation
    // 2. The inventory decrement is bounded by the reservation's quantity
    await tx.$executeRaw`
      UPDATE "Inventory"
      SET "reservedStock" = GREATEST(0, "reservedStock" - ${res.quantity}),
          "updatedAt" = NOW()
      WHERE "productId" = ${res.productId}
        AND "warehouseId" = ${res.warehouseId}
    `;
  }

  // Bulk update statuses
  const expiredIds = expired.map((r) => r.id);
  await tx.reservation.updateMany({
    where: { id: { in: expiredIds }, status: "pending" },
    data: { status: "released", updatedAt: now },
  });

  return expired.length;
}

// ── Core service methods ──────────────────────────────────────────────────

/**
 * Creates a reservation with atomic stock deduction.
 *
 * The atomic conditional UPDATE is the core concurrency primitive.
 * See module docblock for detailed explanation.
 */
export async function createReservation(
  productId: string,
  warehouseId: string,
  quantity: number
): Promise<ServiceResult<ReservationWithRelations>> {
  const expiresAt = new Date(
    Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000
  );

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Step 1: Lazy expiry cleanup — free stale stock before evaluating availability.
      // This ensures expired reservations don't block new legitimate requests.
      await releaseExpiredReservations(tx);

      // Step 2: THE CRITICAL ATOMIC UPDATE
      // This single statement atomically checks availability AND reserves stock.
      // PostgreSQL guarantees this is serializable at the row level.
      //
      // If (totalStock - reservedStock) < quantity, the WHERE fails and
      // 0 rows are updated. No stock is touched.
      const updateResult = await tx.$executeRaw`
        UPDATE "Inventory"
        SET "reservedStock" = "reservedStock" + ${quantity},
            "updatedAt" = NOW()
        WHERE "productId" = ${productId}
          AND "warehouseId" = ${warehouseId}
          AND ("totalStock" - "reservedStock") >= ${quantity}
      `;

      // Step 3: Interpret the result
      if (updateResult === 0) {
        // Either no inventory row exists, or insufficient stock.
        // We need to distinguish these for a better error message.
        const inventory = await tx.inventory.findUnique({
          where: {
            productId_warehouseId: { productId, warehouseId },
          },
          select: { totalStock: true, reservedStock: true },
        });

        if (!inventory) {
          throw new InsufficientStockError(
            "No inventory found for this product/warehouse combination",
            404
          );
        }

        const available = inventory.totalStock - inventory.reservedStock;
        throw new InsufficientStockError(
          `Insufficient stock: requested ${quantity}, available ${available}`,
          409
        );
      }

      // Step 4: Create the reservation record
      const reservation = await tx.reservation.create({
        data: {
          productId,
          warehouseId,
          quantity,
          status: "pending",
          expiresAt,
        },
        include: {
          product: { select: { id: true, name: true, sku: true } },
          warehouse: { select: { id: true, name: true, location: true } },
        },
      });

      return reservation;
    });

    await invalidateProductsInventoryCache();
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return { ok: false, error: err.message, statusCode: err.statusCode };
    }
    throw err; // Re-throw unexpected errors
  }
}

/**
 * Confirms a pending reservation.
 *
 * Confirmation converts a soft reservation into a permanent stock deduction:
 *   totalStock  -= quantity
 *   reservedStock -= quantity
 *
 * This is idempotent at the state-machine level: only pending reservations
 * can be confirmed. The WHERE clause on status prevents double-confirm.
 *
 * Error codes:
 *   404 → reservation not found
 *   409 → already confirmed or released (wrong state)
 *   410 → expired (still pending but past expiresAt)
 */
export async function confirmReservation(
  reservationId: string
): Promise<ServiceResult<ReservationWithRelations>> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Lock the reservation row to prevent concurrent state changes.
      // FOR UPDATE ensures we're the only transaction operating on this row.
      const reservations = await tx.$queryRaw<
        { id: string; productId: string; warehouseId: string; quantity: number; status: string; expiresAt: Date }[]
      >`
        SELECT id, "productId", "warehouseId", quantity, status, "expiresAt"
        FROM "Reservation"
        WHERE id = ${reservationId}
        FOR UPDATE
      `;

      if (reservations.length === 0) {
        throw new ReservationError("Reservation not found", 404);
      }

      const reservation = reservations[0];

      // State machine check — order matters:
      // 1. Check non-pending states first (wrong state is different from expired)
      if (reservation.status === "confirmed") {
        throw new ReservationError(
          "Reservation is already confirmed",
          409
        );
      }

      if (reservation.status === "released") {
        throw new ReservationError(
          "Reservation has been released and cannot be confirmed",
          409
        );
      }

      // 2. Check expiry (only applies to pending reservations)
      if (new Date(reservation.expiresAt) < new Date()) {
        // Clean up this expired reservation while we have the lock
        await tx.$executeRaw`
          UPDATE "Inventory"
          SET "reservedStock" = GREATEST(0, "reservedStock" - ${reservation.quantity}),
              "updatedAt" = NOW()
          WHERE "productId" = ${reservation.productId}
            AND "warehouseId" = ${reservation.warehouseId}
        `;

        await tx.reservation.update({
          where: { id: reservationId },
          data: { status: "released", updatedAt: new Date() },
        });

        throw new ReservationError(
          "Reservation has expired and can no longer be confirmed",
          410
        );
      }

      // Step 3: Atomic stock deduction — convert reservation to permanent deduction
      // Both totalStock and reservedStock decrease, keeping available constant.
      // We guard with AND to prevent going below zero (belt & suspenders — DB CHECK handles it too).
      const inventoryUpdate = await tx.$executeRaw`
        UPDATE "Inventory"
        SET "totalStock" = "totalStock" - ${reservation.quantity},
            "reservedStock" = "reservedStock" - ${reservation.quantity},
            "updatedAt" = NOW()
        WHERE "productId" = ${reservation.productId}
          AND "warehouseId" = ${reservation.warehouseId}
          AND "reservedStock" >= ${reservation.quantity}
          AND "totalStock" >= ${reservation.quantity}
      `;

      if (inventoryUpdate === 0) {
        // This should never happen if the system is consistent,
        // but we handle it defensively
        throw new ReservationError(
          "Inventory inconsistency detected — please contact support",
          500
        );
      }

      // Step 4: Transition reservation to confirmed
      const updated = await tx.reservation.update({
        where: {
          id: reservationId,
          status: "pending", // Extra guard — should already be confirmed from lock above
        },
        data: { status: "confirmed", updatedAt: new Date() },
        include: {
          product: { select: { id: true, name: true, sku: true } },
          warehouse: { select: { id: true, name: true, location: true } },
        },
      });

      return updated;
    });

    await invalidateProductsInventoryCache();
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof ReservationError) {
      return { ok: false, error: err.message, statusCode: err.statusCode };
    }
    throw err;
  }
}

/**
 * Releases a pending reservation, freeing its reserved stock.
 *
 * Idempotency: Only pending reservations can be released.
 * Attempting to release a confirmed or already-released reservation is a 409.
 */
export async function releaseReservation(
  reservationId: string
): Promise<ServiceResult<ReservationWithRelations>> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Acquire row lock
      const reservations = await tx.$queryRaw<
        { id: string; productId: string; warehouseId: string; quantity: number; status: string }[]
      >`
        SELECT id, "productId", "warehouseId", quantity, status
        FROM "Reservation"
        WHERE id = ${reservationId}
        FOR UPDATE
      `;

      if (reservations.length === 0) {
        throw new ReservationError("Reservation not found", 404);
      }

      const reservation = reservations[0];

      if (reservation.status === "confirmed") {
        throw new ReservationError(
          "Confirmed reservations cannot be released — contact support to process a return",
          409
        );
      }

      if (reservation.status === "released") {
        throw new ReservationError(
          "Reservation is already released",
          409
        );
      }

      // Free the reserved stock
      await tx.$executeRaw`
        UPDATE "Inventory"
        SET "reservedStock" = GREATEST(0, "reservedStock" - ${reservation.quantity}),
            "updatedAt" = NOW()
        WHERE "productId" = ${reservation.productId}
          AND "warehouseId" = ${reservation.warehouseId}
      `;

      // Transition to released
      const updated = await tx.reservation.update({
        where: { id: reservationId, status: "pending" },
        data: { status: "released", updatedAt: new Date() },
        include: {
          product: { select: { id: true, name: true, sku: true } },
          warehouse: { select: { id: true, name: true, location: true } },
        },
      });

      return updated;
    });

    await invalidateProductsInventoryCache();
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof ReservationError) {
      return { ok: false, error: err.message, statusCode: err.statusCode };
    }
    throw err;
  }
}

/**
 * Fetches products with inventory aggregated across warehouses.
 * Runs lazy expiry cleanup first to ensure available stock is fresh.
 */
export async function getProductsWithInventory() {
  const cached = await redisGetJson(PRODUCTS_INVENTORY_CACHE_KEY);
  if (cached) return cached;

  // Lazy cleanup outside transaction is fine for reads —
  // the cleanup runs in its own transaction
  await prisma.$transaction((tx) => releaseExpiredReservations(tx));

  const products = await prisma.product.findMany({
    include: {
      inventory: {
        include: {
          warehouse: { select: { id: true, name: true, location: true } },
        },
        orderBy: { warehouse: { name: "asc" } },
      },
    },
    orderBy: { name: "asc" },
  });

  const response = products.map((p) => ({
    ...p,
    inventory: p.inventory.map((inv) => ({
      ...inv,
      availableStock: inv.totalStock - inv.reservedStock,
    })),
  }));

  await redisSetJson(
    PRODUCTS_INVENTORY_CACHE_KEY,
    response,
    PRODUCTS_INVENTORY_CACHE_TTL_SECONDS
  );

  return response;
}

/**
 * Gets a single reservation by ID with relations.
 */
export async function getReservation(
  reservationId: string
): Promise<ReservationWithRelations | null> {
  return prisma.reservation.findUnique({
    where: { id: reservationId },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      warehouse: { select: { id: true, name: true, location: true } },
    },
  });
}

/**
 * Bulk expiry cleanup — called by the cron endpoint.
 * Returns the number of reservations released.
 */
export async function cleanupExpiredReservations(): Promise<number> {
  const released = await prisma.$transaction((tx) =>
    releaseExpiredReservations(tx)
  );
  if (released > 0) await invalidateProductsInventoryCache();
  return released;
}

async function invalidateProductsInventoryCache(): Promise<void> {
  await redisDel(PRODUCTS_INVENTORY_CACHE_KEY);
}

// ── Idempotency ───────────────────────────────────────────────────────────

export function computeRequestHash(
  method: string,
  path: string,
  body: unknown
): string {
  const payload = JSON.stringify({ method, path, body });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export async function getIdempotencyRecord(key: string) {
  return prisma.idempotencyRecord.findUnique({
    where: { idempotencyKey: key },
  });
}

export async function saveIdempotencyRecord(
  key: string,
  requestHash: string,
  response: unknown,
  statusCode: number
) {
  await prisma.idempotencyRecord.upsert({
    where: { idempotencyKey: key },
    create: { idempotencyKey: key, requestHash, response: response as Prisma.InputJsonValue, statusCode },
    update: {}, // Never overwrite — first write wins
  });
}

// ── Error types ───────────────────────────────────────────────────────────

class InsufficientStockError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "InsufficientStockError";
  }
}

class ReservationError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "ReservationError";
  }
}
