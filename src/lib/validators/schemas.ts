/**
 * Zod schemas for API input validation.
 *
 * All schemas are strict (no extra keys allowed) to prevent
 * accidental mass-assignment vulnerabilities.
 */

import { z } from "zod";

// ── Reservation creation ──────────────────────────────────────────────────

export const CreateReservationSchema = z.object({
  productId: z.string().cuid("Invalid product ID"),
  warehouseId: z.string().cuid("Invalid warehouse ID"),
  quantity: z
    .number()
    .int("Quantity must be an integer")
    .positive("Quantity must be positive")
    .max(10_000, "Quantity exceeds maximum per reservation"),
});

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;

// ── Reservation ID param ──────────────────────────────────────────────────

export const ReservationIdSchema = z.object({
  id: z.string().cuid("Invalid reservation ID"),
});

// ── Query params ──────────────────────────────────────────────────────────

export const ProductQuerySchema = z.object({
  warehouseId: z.string().cuid().optional(),
});

// ── Idempotency ───────────────────────────────────────────────────────────

export const IDEMPOTENCY_KEY_HEADER = "idempotency-key";
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

export const IdempotencyKeySchema = z
  .string()
  .min(1, "Idempotency key cannot be empty")
  .max(
    IDEMPOTENCY_KEY_MAX_LENGTH,
    `Idempotency key exceeds ${IDEMPOTENCY_KEY_MAX_LENGTH} chars`
  )
  .regex(
    /^[a-zA-Z0-9_\-]+$/,
    "Idempotency key must be alphanumeric with _ or -"
  );
