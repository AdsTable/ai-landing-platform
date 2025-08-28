import { Router } from "express";
import { serviceRegistry } from "../services/registry.js";

/**
 * Health routes for internal service status and active health checks.
 * Security-first defaults with IP policy, admin gating, caching, and concurrency de-duplication.
 *
 * Mount as: app.use('/health', healthRoutes);
 * Endpoint:  GET /health/services[?active=true]
 *
 * Env:
 * - HEALTH_PUBLIC=false            # if false, requires admin session
 * - HEALTH_IP_ALLOWLIST=1.2.3.4    # optional, CSV; if set, only allow these IPs
 * - HEALTH_IP_DENYLIST=5.6.7.8     # optional, CSV; always block these IPs
 * - HEALTH_CHECK_CACHE_SECONDS=20  # TTL for active checks cache (clamped 10..30)
 * - HEALTH_CHECK_TIMEOUT_MS=2000   # timeout per service healthCheck
 *
 * Note:
 * - Ensure app.set('trust proxy', 1) if running behind reverse proxy, so req.ip is correct.
 */

const router = Router();

// Parse CSV env config into arrays
const parseList = (v) => (v || "").split(",").map((s) => s.trim()).filter(Boolean);

// Clamp TTL to 10..30 seconds as per requirement
const HEALTH_CACHE_TTL = (() => {
  const raw = Number(process.env.HEALTH_CHECK_CACHE_SECONDS || 20);
  const val = Number.isFinite(raw) ? raw : 20;
  return Math.min(30, Math.max(10, val));
})();

const HEALTH_TIMEOUT_MS = Number(process.env.HEALTH_CHECK_TIMEOUT_MS || 2000);
const HEALTH_ALLOWLIST = parseList(process.env.HEALTH_IP_ALLOWLIST);
const HEALTH_DENYLIST = parseList(process.env.HEALTH_IP_DENYLIST);

// In-memory cache for active health results
const servicesHealthCache = {
  data: null,        // cached payload
  expiresAt: 0,      // epoch ms
  inFlight: null,    // Promise for ongoing active check to deduplicate concurrent calls
};

// Basic IP policy checks
function isIpBlocked(ip) {
  if (HEALTH_DENYLIST.length && HEALTH_DENYLIST.includes(ip)) return true;
  if (HEALTH_ALLOWLIST.length && !HEALTH_ALLOWLIST.includes(ip)) return true;
  return false;
}

/**
 * GET /health/services
 * - passive mode (default): returns registry status only, no external calls
 * - active mode (?active=true): runs healthCheck() for services, caches results 10–30s
 */
router.get("/services", async (req, res) => {
  try {
    // 1) IP policy first — short-circuit if blocked
    if (isIpBlocked(req.ip)) {
      return res.status(403).json({ error: "Forbidden by IP policy" });
    }

    // 2) Access policy
    const isPublic = String(process.env.HEALTH_PUBLIC || "false").toLowerCase() === "true";
    if (!isPublic) {
      // Require authenticated admin
      const isAdmin = Boolean(req.user && (req.user.role === "admin" || req.user.isAdmin));
      if (!isAdmin) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    // 3) Base passive status (no external calls)
    const base = serviceRegistry.getStatus();
    const active = String(req.query.active || "false").toLowerCase() === "true";

    if (!active) {
      // Passive mode: return registry status
      res.setHeader("X-Health-Mode", "passive");
      // Clients shouldn't cache this endpoint at their side
      res.setHeader("Cache-Control", "no-store");
      return res.json({ mode: "passive", ...base });
    }

    // 4) Active mode: serve from cache if fresh
    const now = Date.now();
    if (servicesHealthCache.data && servicesHealthCache.expiresAt > now) {
      res.setHeader("X-Health-Mode", "active-cached");
      res.setHeader("Cache-Control", "no-store");
      return res.json(servicesHealthCache.data);
    }

    // 5) Deduplicate parallel requests running active health checks
    if (!servicesHealthCache.inFlight) {
      servicesHealthCache.inFlight = (async () => {
        // Run all health checks in parallel with a per-service timeout
        const checks = await serviceRegistry.runHealthChecks({
          timeoutMs: HEALTH_TIMEOUT_MS,
          parallel: true,
        });

        // Merge passive registry status with active results by service name
        const byName = new Map(checks.checks.map((c) => [c.name, c]));
        const services = base.services.map((s) => ({
          ...s,
          health: byName.get(s.name) || null,
        }));

        const payload = {
          mode: "active",
          timestamp: checks.timestamp,
          ttlSeconds: HEALTH_CACHE_TTL,
          services,
        };

        // Cache for TTL window
        servicesHealthCache.data = payload;
        servicesHealthCache.expiresAt = Date.now() + HEALTH_CACHE_TTL * 1000;

        return payload;
      })().finally(() => {
        // Release lock on the next tick after resolution
        setTimeout(() => {
          servicesHealthCache.inFlight = null;
        }, 0);
      });
    }

    const result = await servicesHealthCache.inFlight;
    res.setHeader("X-Health-Mode", "active");
    res.setHeader("Cache-Control", "no-store");
    return res.json(result);
  } catch (error) {
    // Ensure errors do not expose internal details unnecessarily
    return res.status(500).json({ error: "Health check failed", details: error.message });
  }
});

export default router;