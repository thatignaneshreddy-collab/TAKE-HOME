/**
 * Idempotency middleware for Next.js Route Handlers.
 *
 * Usage:
 *   const idempotencyResult = await checkIdempotency(request, path, body);
 *   if (idempotencyResult) return idempotencyResult; // Return cached response
 *   // ... perform operation ...
 *   await recordIdempotency(request, path, body, responseData, statusCode);
 *
 * Behavior:
 *   - Same key + same payload → return original response
 *   - Same key + different payload → return 422 (client bug)
 *   - No key → proceed normally
 */

import { NextRequest, NextResponse } from "next/server";
import {
  computeRequestHash,
  getIdempotencyRecord,
  saveIdempotencyRecord,
} from "@/lib/services/inventory.service";
import {
  IDEMPOTENCY_KEY_HEADER,
  IdempotencyKeySchema,
} from "@/lib/validators/schemas";

export async function checkIdempotency(
  request: NextRequest,
  path: string,
  body: unknown
): Promise<NextResponse | null> {
  const rawKey = request.headers.get(IDEMPOTENCY_KEY_HEADER);
  if (!rawKey) return null;

  const keyParse = IdempotencyKeySchema.safeParse(rawKey);
  if (!keyParse.success) {
    return NextResponse.json(
      { error: `Invalid idempotency key: ${keyParse.error.issues[0].message}` },
      { status: 400 }
    );
  }

  const key = keyParse.data;
  const hash = computeRequestHash(request.method, path, body);
  const existing = await getIdempotencyRecord(key);

  if (existing) {
    if (existing.requestHash !== hash) {
      return NextResponse.json(
        {
          error:
            "Idempotency key reused with a different request payload. " +
            "Use a unique key for each distinct request.",
        },
        { status: 422 }
      );
    }
    // Return the cached response — mark it so clients know it's a replay
    return NextResponse.json(existing.response, {
      status: existing.statusCode,
      headers: { "Idempotent-Replayed": "true" },
    });
  }

  return null;
}

export async function recordIdempotency(
  request: NextRequest,
  path: string,
  body: unknown,
  response: unknown,
  statusCode: number
): Promise<void> {
  const rawKey = request.headers.get(IDEMPOTENCY_KEY_HEADER);
  if (!rawKey) return;

  const keyParse = IdempotencyKeySchema.safeParse(rawKey);
  if (!keyParse.success) return;

  const hash = computeRequestHash(request.method, path, body);
  await saveIdempotencyRecord(keyParse.data, hash, response, statusCode);
}
