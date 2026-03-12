import { createHash } from "node:crypto";
import { createClient } from "redis";

type CacheStore = "redis" | "memory";
type CacheStatus = "hit" | "miss";

type MemoryEntry = {
  payload: string;
  expiresAt: number;
};

type CachedJsonOptions<T> = {
  namespace: string;
  keyData: unknown;
  tags: string[];
  ttlSeconds: number;
  compute: () => Promise<T> | T;
};

type CachedJsonResult<T> = {
  value: T;
  meta: {
    status: CacheStatus;
    store: CacheStore;
    ttlSeconds: number;
  };
};

const CACHE_PREFIX = "openclaw:orchestrator:response-cache";
const REDIS_RETRY_COOLDOWN_MS = 30_000;
const REDIS_CONNECT_TIMEOUT_MS = 250;
type RedisConnection = ReturnType<typeof createClient>;

const memoryEntries = new Map<string, MemoryEntry>();
const memoryTagVersions = new Map<string, number>();

let redisClient: RedisConnection | null = null;
let redisConnectPromise: Promise<RedisConnection | null> | null = null;
let redisDisabledUntil = 0;
let lastRedisWarning: string | null = null;

function normalizeTags(tags: string[]) {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    ),
  ).sort();
}

function stableNormalize(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map((item) => stableNormalize(item));
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nextValue]) => [key, stableNormalize(nextValue)]);
    return Object.fromEntries(entries);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return String(value);
  }
  return value;
}

function stableSerialize(value: unknown) {
  return JSON.stringify(stableNormalize(value));
}

function buildHash(value: unknown) {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function pruneMemoryEntries(now = Date.now()) {
  for (const [key, entry] of memoryEntries.entries()) {
    if (entry.expiresAt <= now) {
      memoryEntries.delete(key);
    }
  }
}

function logRedisWarning(message: string) {
  if (lastRedisWarning === message) return;
  lastRedisWarning = message;
  console.warn(`[response-cache] ${message}`);
}

async function getRedisClient(): Promise<RedisConnection | null> {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) return null;

  if (redisClient?.isOpen) {
    return redisClient;
  }

  if (redisConnectPromise) {
    return redisConnectPromise;
  }

  if (redisDisabledUntil > Date.now()) {
    return null;
  }

  const nextClient = createClient({
    url: redisUrl,
    socket: {
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      reconnectStrategy: false,
    },
  });
  nextClient.on("error", (error) => {
    logRedisWarning(`redis client error: ${(error as Error).message}`);
  });

  redisConnectPromise = nextClient
    .connect()
    .then(() => {
      redisClient = nextClient;
      lastRedisWarning = null;
      return nextClient;
    })
    .catch((error) => {
      redisDisabledUntil = Date.now() + REDIS_RETRY_COOLDOWN_MS;
      logRedisWarning(
        `redis unavailable, falling back to in-memory cache for ${Math.round(
          REDIS_RETRY_COOLDOWN_MS / 1000,
        )}s after ${REDIS_CONNECT_TIMEOUT_MS}ms timeout: ${(error as Error).message}`,
      );
      void nextClient.disconnect().catch(() => {});
      redisClient = null;
      return null;
    })
    .finally(() => {
      redisConnectPromise = null;
    });

  return redisConnectPromise;
}

async function readTagVersions(tags: string[]) {
  const normalized = normalizeTags(tags);
  const client = await getRedisClient();

  if (client) {
    try {
      const keys = normalized.map((tag) => `${CACHE_PREFIX}:tag:${tag}:version`);
      const values = await client.mGet(keys);
      return Object.fromEntries(
        normalized.map((tag, index) => [tag, Number(values[index] ?? "0") || 0]),
      );
    } catch (error) {
      logRedisWarning(
        `failed to read redis cache tags, falling back to in-memory versions: ${
          (error as Error).message
        }`,
      );
    }
  }

  return Object.fromEntries(
    normalized.map((tag) => [tag, memoryTagVersions.get(tag) ?? 0]),
  );
}

async function bumpTagVersions(tags: string[]) {
  const normalized = normalizeTags(tags);
  if (normalized.length === 0) return;

  const client = await getRedisClient();
  if (client) {
    try {
      const multi = client.multi();
      for (const tag of normalized) {
        multi.incr(`${CACHE_PREFIX}:tag:${tag}:version`);
      }
      await multi.exec();
    } catch (error) {
      logRedisWarning(
        `failed to bump redis cache tags, using in-memory versions: ${
          (error as Error).message
        }`,
      );
    }
  }

  for (const tag of normalized) {
    memoryTagVersions.set(tag, (memoryTagVersions.get(tag) ?? 0) + 1);
  }
  pruneMemoryEntries();
}

export async function invalidateResponseCacheTags(tags: string[]) {
  await bumpTagVersions(tags);
}

export async function getCachedJson<T>(
  options: CachedJsonOptions<T>,
): Promise<CachedJsonResult<T>> {
  const ttlSeconds = Math.max(1, Math.floor(options.ttlSeconds));
  const tagVersions = await readTagVersions(options.tags);
  const cacheKey = `${CACHE_PREFIX}:entry:${options.namespace}:${buildHash({
    keyData: options.keyData,
    tagVersions,
  })}`;

  const client = await getRedisClient();
  if (client) {
    try {
      const cached = await client.get(cacheKey);
      if (cached) {
        return {
          value: JSON.parse(cached) as T,
          meta: {
            status: "hit",
            store: "redis",
            ttlSeconds,
          },
        };
      }

      const value = await Promise.resolve(options.compute());
      await client.setEx(cacheKey, ttlSeconds, JSON.stringify(value));
      return {
        value,
        meta: {
          status: "miss",
          store: "redis",
          ttlSeconds,
        },
      };
    } catch (error) {
      logRedisWarning(
        `redis cache request failed, falling back to in-memory cache: ${
          (error as Error).message
        }`,
      );
    }
  }

  const now = Date.now();
  pruneMemoryEntries(now);
  const cached = memoryEntries.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return {
      value: JSON.parse(cached.payload) as T,
      meta: {
        status: "hit",
        store: "memory",
        ttlSeconds,
      },
    };
  }

  const value = await Promise.resolve(options.compute());
  memoryEntries.set(cacheKey, {
    payload: JSON.stringify(value),
    expiresAt: now + ttlSeconds * 1000,
  });
  return {
    value,
    meta: {
      status: "miss",
      store: "memory",
      ttlSeconds,
    },
  };
}

export async function resetResponseCacheForTests() {
  memoryEntries.clear();
  memoryTagVersions.clear();
  redisDisabledUntil = 0;
  lastRedisWarning = null;
  if (redisClient?.isOpen) {
    await redisClient.disconnect();
  }
  redisClient = null;
  redisConnectPromise = null;
}
