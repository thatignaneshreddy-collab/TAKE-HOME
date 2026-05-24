/**
 * POST /api/reservations
 *
 * Creates a new reservation. This is the most concurrency-sensitive
 * endpoint in the system — see inventory.service.ts for the full
 * explanation of the atomic conditional update pattern.
 *
 * Supports idempotency via Idempotency-Key header.
 *
 * Request body:
 *   { productId: string, warehouseId: string, quantity: number }
 *
 * Responses:
 *   201 → reservation created
 *   400 → validation error
 *   404 → no inventory row for this product/warehouse
 *   409 → insufficient stock (the important one)
 *   500 → unexpected server error
 */

import { NextRequest, NextResponse } from "next/server";
import { CreateReservationSchema } from "@/lib/validators/schemas";
import { createReservation } from "@/lib/services/inventory.service";
import {
  checkIdempotency,
  recordIdempotency,
} from "@/lib/services/idempotency";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const PATH = "/api/reservations";

export async function POST(request: NextRequest) {
  const rateLimited = await checkRateLimit(request, {
    key: "reservation-create",
    limit: 60,
    windowSeconds: 60,
  });
  if (rateLimited) return rateLimited;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Idempotency check — return cached response if key was already used
  const idempotentResponse = await checkIdempotency(request, PATH, body);
  if (idempotentResponse) return idempotentResponse;

  // Validate input
  const parsed = CreateReservationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  const { productId, warehouseId, quantity } = parsed.data;

  const result = await createReservation(productId, warehouseId, quantity);

  if (!result.ok) {
    const responseBody = { error: result.error };
    await recordIdempotency(request, PATH, body, responseBody, result.statusCode);
    return NextResponse.json(responseBody, { status: result.statusCode });
  }

  const responseBody = { reservation: result.data };
  await recordIdempotency(request, PATH, body, responseBody, 201);

  return NextResponse.json(responseBody, { status: 201 });
}
