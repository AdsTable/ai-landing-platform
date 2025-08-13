// Simple in-memory cache for generated content

const cache = new Map();

export function getFromCache(key) {
    return cache.get(key);
}

export function saveToCache(key, value) {
    cache.set(key, value);
}

export function getAllCacheKeys() {
    return Array.from(cache.keys());
}
