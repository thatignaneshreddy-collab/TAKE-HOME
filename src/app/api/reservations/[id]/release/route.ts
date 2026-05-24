/**
 * POST /api/reservations/:id/release
 *
 * Releases a pending reservation, freeing reserved stock.
 *
 * State machine: pending → released
 *
 * Errors:
 *   404 → not found
 *   409 → already confirmed (cannot release) or already released
 */

import { NextRequest, NextResponse } from "next/server";
import { releaseReservation } from "@/lib/services/inventory.service";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await releaseReservation(params.id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.statusCode });
  }

  return NextResponse.json({ reservation: result.data }, { status: 200 });
}
