import { NextRequest, NextResponse } from "next/server";
import { isRedisEnabled, redisCommand } from "@/lib/redis";

interface RateLimitOptions {
  key: string;
  limit: number;
  windowSeconds: number;
}

export async function checkRateLimit(
  request: NextRequest,
  options: RateLimitOptions
): Promise<NextResponse | null> {
  if (!isRedisEnabled) return null;

  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip =
    forwardedFor?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const key = `rate:${options.key}:${ip}`;

  const count = await redisCommand<number>(["INCR", key]);
  if (count === null) return null;

  if (count === 1) {
    await redisCommand(["EXPIRE", key, options.windowSeconds]);
  }

  if (count <= options.limit) return null;

  return NextResponse.json(
    { error: "Too many requests. Please retry shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(options.windowSeconds),
        "X-RateLimit-Limit": String(options.limit),
        "X-RateLimit-Remaining": "0",
      },
    }
  );
}
