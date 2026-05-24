/**
 * GET /api/cleanup
 *
 * Cron endpoint for periodic cleanup of expired reservations.
 * Should be called every 1-5 minutes by Vercel Cron or an external scheduler.
 *
 * Protected by CRON_SECRET to prevent unauthorized invocation.
 *
 * Vercel cron.json config:
 *   {
 *     "crons": [{
 *       "path": "/api/cleanup",
 *       "schedule": "* * * * *"   <- every minute
 *     }]
 *   }
 *
 * The cleanup is also performed lazily before reservation creation
 * and inventory fetches, so this cron is a belt-and-suspenders measure
 * to prevent inventory from drifting over time if the lazy paths
 * aren't hit for a while.
 */

import { NextRequest, NextResponse } from "next/server";
import { cleanupExpiredReservations } from "@/lib/services/inventory.service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent abuse
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const released = await cleanupExpiredReservations();

    console.log(`[cron/cleanup] Released ${released} expired reservations`);

    return NextResponse.json({
      ok: true,
      releasedCount: released,
      cleanedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[cron/cleanup] Failed:", err);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
