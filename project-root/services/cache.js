// - Sync API (getFromCache, saveToCache, getAllCacheKeys) keeps working with in-memory Map.
//   It also attempts non-blocking replication to Redis when available.
// - Async API (getFromCacheAsync, saveToCacheAsync, getAllCacheKeysAsync) uses Redis if connected,
//   with TTL support and JSON helpers, and falls back to memory if Redis is unavailable.

import { createClient } from "redis";

const mem = new Map();

let redisClient = null;
let redisReady = false;
let redisConnecting = null;

function asString(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify({ __json: true, v: value });
  } catch {
    // last-resort stringify
    return String(value);
  }
}

function fromString(raw) {
  if (typeof raw !== "string") return raw;
  // Attempt to parse our wrapped JSON payloads
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.__json) return parsed.v;
  } catch {
    // ignore
  }
  return raw;
}

async function ensureRedis() {
  if (redisReady) return redisClient;
  if (redisConnecting) return redisConnecting;

  const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  redisClient = createClient({ url });

  redisClient.on("error", (err) => {
    // Do not crash on redis errors; keep using memory fallback.
    console.error("[cache] Redis error:", err?.message || err);
  });

  redisConnecting = (async () => {
    try {
      await redisClient.connect();
      redisReady = true;
      console.log("[cache] Connected to Redis");
    } catch (e) {
      // If connection fails, stay on memory mode
      redisReady = false;
      console.warn("[cache] Redis connection failed, using in-memory cache only:", e?.message || e);
    } finally {
      redisConnecting = null;
    }
    return redisClient;
  })();

  return redisConnecting;
}

// ========== SYNC API (backward compatible) ==========
// Note: These operate on in-memory Map. If Redis is available,
// we replicate writes asynchronously and opportunistically hydrate reads.

export function getFromCache(key) {
  const val = mem.get(key);
  if (val !== undefined) return val;

  // Opportunistically hydrate from Redis in background (non-blocking)
  if (redisReady) {
    // Fire-and-forget hydration; no await to keep sync contract
    redisClient
      .get(key)
      .then((raw) => {
        if (raw !== null && !mem.has(key)) {
          mem.set(key, fromString(raw));
        }
      })
      .catch(() => {});
  }
  return undefined;
}

export function saveToCache(key, value) {
  mem.set(key, value);
  // Replicate to Redis in background if available
  if (redisReady) {
    const payload = asString(value);
    // No TTL in sync API to preserve signature; use async API for TTL
    redisClient.set(key, payload).catch(() => {});
  }
}

export function getAllCacheKeys() {
  // Sync version cannot scan Redis; returns only local keys.
  return Array.from(mem.keys());
}

// ========== ASYNC API (preferred for new code) ==========

export async function initCache() {
  await ensureRedis();
  return redisReady;
}

export function isRedisAvailable() {
  return redisReady;
}

export async function getFromCacheAsync(key, { json = false } = {}) {
  await ensureRedis();
  if (redisReady) {
    const raw = await redisClient.get(key);
    if (raw === null) return undefined;
    const val = json ? JSON.parse(raw) : fromString(raw);
    // Keep memory warm
    mem.set(key, val);
    return val;
  }
  // Fallback to memory
  return mem.get(key);
}

export async function saveToCacheAsync(key, value, { ttlSeconds, json = false } = {}) {
  await ensureRedis();
  mem.set(key, value);
  if (redisReady) {
    const payload = json ? JSON.stringify(value) : asString(value);
    const options = ttlSeconds ? { EX: ttlSeconds } : undefined;
    await redisClient.set(key, payload, options);
  }
  return true;
}

export async function getAllCacheKeysAsync(pattern = "*") {
  await ensureRedis();
  if (!redisReady) return Array.from(mem.keys());

  // SCAN-based key listing to avoid blocking Redis
  const keys = [];
  let cursor = "0";
  do {
    const res = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
    cursor = res.cursor;
    keys.push(...res.keys);
  } while (cursor !== "0");

  return keys;
}

// JSON convenience helpers for structured payloads
export async function getJSON(key) {
  return getFromCacheAsync(key, { json: true });
}

export async function setJSON(key, obj, ttlSeconds) {
  return saveToCacheAsync(key, obj, { ttlSeconds, json: true });
}

// Graceful shutdown (optional)
export async function shutdownCache() {
  try {
    if (redisClient && redisReady) await redisClient.quit();
  } catch {
    // ignore
  } finally {
    redisReady = false;
  }
}