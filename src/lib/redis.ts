type RedisCommandPart = string | number;

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export const isRedisEnabled = Boolean(REDIS_URL && REDIS_TOKEN);

export async function redisCommand<T>(
  command: RedisCommandPart[]
): Promise<T | null> {
  if (!isRedisEnabled) return null;

  try {
    const response = await fetch(REDIS_URL!, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn("[redis] command failed", command[0], response.status);
      return null;
    }

    const payload = (await response.json()) as { result?: T; error?: string };
    if (payload.error) {
      console.warn("[redis] command error", command[0], payload.error);
      return null;
    }

    return payload.result ?? null;
  } catch (err) {
    console.warn("[redis] unavailable", err);
    return null;
  }
}

export async function redisGetJson<T>(key: string): Promise<T | null> {
  const value = await redisCommand<string>(["GET", key]);
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    await redisCommand(["DEL", key]);
    return null;
  }
}

export async function redisSetJson(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  await redisCommand(["SET", key, JSON.stringify(value), "EX", ttlSeconds]);
}

export async function redisDel(key: string): Promise<void> {
  await redisCommand(["DEL", key]);
}
