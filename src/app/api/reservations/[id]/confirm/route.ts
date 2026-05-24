/**
 * POST /api/reservations/:id/confirm
 *
 * Confirms a pending reservation, permanently deducting stock.
 *
 * State machine: pending → confirmed
 *
 * Errors:
 *   404 → not found
 *   409 → already confirmed or released
 *   410 → expired (treat like a tombstone — cannot be confirmed)
 */

import { NextRequest, NextResponse } from "next/server";
import { confirmReservation } from "@/lib/services/inventory.service";
import {
  checkIdempotency,
  recordIdempotency,
} from "@/lib/services/idempotency";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const path = `/api/reservations/${params.id}/confirm`;

  // Idempotency: confirming twice with the same key returns the original success
  const idempotentResponse = await checkIdempotency(request, path, {
    action: "confirm",
    id: params.id,
  });
  if (idempotentResponse) return idempotentResponse;

  const result = await confirmReservation(params.id);

  if (!result.ok) {
    const responseBody = { error: result.error };
    await recordIdempotency(
      request,
      path,
      { action: "confirm", id: params.id },
      responseBody,
      result.statusCode
    );
    return NextResponse.json(responseBody, { status: result.statusCode });
  }

  const responseBody = { reservation: result.data };
  await recordIdempotency(
    request,
    path,
    { action: "confirm", id: params.id },
    responseBody,
    200
  );

  return NextResponse.json(responseBody, { status: 200 });
}
