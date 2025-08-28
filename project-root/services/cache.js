// Redis-backed cache with in-memory fallback for high-availability caching
// Preserves existing sync API while adding Redis-backed async capabilities

import { createClient } from 'redis';

// In-memory cache as fallback when Redis is unavailable
const memoryCache = new Map();

// Redis client configuration with ENV-driven settings
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
let redisClient = null;
let isRedisConnected = false;

/**
 * Initialize Redis connection with error handling and fallback behavior
 * Returns initialization status for service registry integration
 */
export async function initialize() {
    try {
        redisClient = createClient({ url: REDIS_URL });
        
        // Handle Redis connection events
        redisClient.on('error', (err) => {
            console.warn('Redis connection error, falling back to in-memory cache:', err.message);
            isRedisConnected = false;
        });
        
        redisClient.on('connect', () => {
            console.log('Redis cache connected successfully');
            isRedisConnected = true;
        });
        
        redisClient.on('disconnect', () => {
            console.warn('Redis cache disconnected, using in-memory fallback');
            isRedisConnected = false;
        });
        
        // Attempt connection with timeout
        await redisClient.connect();
        return { status: 'healthy', message: 'Redis cache initialized' };
        
    } catch (error) {
        console.warn('Failed to initialize Redis cache, using in-memory fallback:', error.message);
        isRedisConnected = false;
        return { status: 'degraded', message: 'Using in-memory cache fallback' };
    }
}

/**
 * Health check for service registry integration
 * Returns cache service health status
 */
export async function ping() {
    if (!isRedisConnected) {
        return { status: 'degraded', mode: 'memory-only' };
    }
    
    try {
        await redisClient.ping();
        return { status: 'healthy', mode: 'redis-backed' };
    } catch (error) {
        isRedisConnected = false;
        return { status: 'degraded', mode: 'memory-fallback', error: error.message };
    }
}

// ===== EXISTING SYNC API (preserved for backward compatibility) =====

/**
 * Get value from cache (sync API, memory-only)
 * Preserved for existing code compatibility
 */
export function getFromCache(key) {
    return memoryCache.get(key);
}

/**
 * Save value to cache (sync API, memory-only) 
 * Preserved for existing code compatibility
 */
export function saveToCache(key, value) {
    memoryCache.set(key, value);
}

/**
 * Get all cache keys (sync API, memory-only)
 * Preserved for existing code compatibility
 */
export function getAllCacheKeys() {
    return Array.from(memoryCache.keys());
}

// ===== NEW ASYNC API (Redis-backed with fallback) =====

/**
 * Get value from cache asynchronously (Redis-backed with memory fallback)
 * @param {string} key - Cache key
 * @returns {Promise<any>} - Cached value or null
 */
export async function getFromCacheAsync(key) {
    // Try Redis first if connected
    if (isRedisConnected && redisClient) {
        try {
            const value = await redisClient.get(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            console.warn('Redis get failed, trying memory cache:', error.message);
            isRedisConnected = false;
        }
    }
    
    // Fallback to in-memory cache
    return memoryCache.get(key) || null;
}

/**
 * Save value to cache asynchronously with TTL (Redis-backed with memory fallback)
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttlSeconds - TTL in seconds (default: no expiration)
 * @returns {Promise<boolean>} - Success status
 */
export async function saveToCacheAsync(key, value, ttlSeconds = null) {
    let redisSuccess = false;
    
    // Try Redis first if connected
    if (isRedisConnected && redisClient) {
        try {
            const serialized = JSON.stringify(value);
            if (ttlSeconds) {
                await redisClient.setEx(key, ttlSeconds, serialized);
            } else {
                await redisClient.set(key, serialized);
            }
            redisSuccess = true;
        } catch (error) {
            console.warn('Redis set failed, using memory cache:', error.message);
            isRedisConnected = false;
        }
    }
    
    // Always save to in-memory cache as fallback
    memoryCache.set(key, value);
    
    // If TTL specified, set timeout for memory cache cleanup
    if (ttlSeconds && !redisSuccess) {
        setTimeout(() => {
            if (memoryCache.has(key)) {
                memoryCache.delete(key);
            }
        }, ttlSeconds * 1000);
    }
    
    return true; // Always succeed with fallback
}

/**
 * Get JSON value from cache (convenience method)
 * @param {string} key - Cache key
 * @returns {Promise<Object|null>} - Parsed JSON object or null
 */
export async function getJSON(key) {
    return await getFromCacheAsync(key);
}

/**
 * Set JSON value in cache with TTL (convenience method)
 * @param {string} key - Cache key  
 * @param {Object} jsonValue - Object to cache
 * @param {number} ttlSeconds - TTL in seconds
 * @returns {Promise<boolean>} - Success status
 */
export async function setJSON(key, jsonValue, ttlSeconds) {
    return await saveToCacheAsync(key, jsonValue, ttlSeconds);
}

/**
 * Clear cache entry
 * @param {string} key - Cache key to remove
 * @returns {Promise<boolean>} - Success status
 */
export async function clearCache(key) {
    // Remove from Redis if connected
    if (isRedisConnected && redisClient) {
        try {
            await redisClient.del(key);
        } catch (error) {
            console.warn('Redis delete failed:', error.message);
            isRedisConnected = false;
        }
    }
    
    // Always remove from memory cache
    return memoryCache.delete(key);
}
