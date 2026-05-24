import { NextRequest, NextResponse } from "next/server";
import { getReservation } from "@/lib/services/inventory.service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const reservation = await getReservation(params.id);

    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ reservation });
  } catch (err) {
    console.error(`[GET /api/reservations/${params.id}]`, err);
    return NextResponse.json(
      { error: "Failed to fetch reservation" },
      { status: 500 }
    );
  }
}
