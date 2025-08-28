import { serviceRegistry } from "./registry.js";
import aiService from "./ai.js";
import billingService from "./billing.js";
import { usageValidator } from "./usageValidator.js";
import { logger } from "./logger.js";

/**
 * Helper to safely register an optional service module without failing the app if absent.
 */
async function registerOptionalService(name, importPath, options = {}) {
  try {
    const mod = await import(importPath);
    const serviceModule = mod?.default ?? mod;
    serviceRegistry.register(name, serviceModule, {
      version: options.version || "1.0.0",
      description: options.description || `${name} service`,
      dependencies: options.dependencies || [],
      tags: options.tags || [],
      timeout: options.timeout || 30000,
      healthCheck: options.healthCheck || (async () => ({ status: "healthy" })),
    });

    if (options.initialize !== false) {
      try {
        await serviceRegistry.initialize(name);
        logger.info(`Initialized optional service: ${name}`);
      } catch (err) {
        const failFast = String(process.env.BOOT_FAIL_FAST || "false").toLowerCase() === "true";
        logger?.warn?.(`Optional service initialization failed: ${name} — ${err.message}`);
        if (failFast) throw err;
      }
    }
  } catch {
    logger?.info?.(`Optional service not available: ${name}`);
  }
}

/**
 * Bootstrap all core platform services in a deterministic order.
 */
export async function bootstrapServices() {
  // Logger
  serviceRegistry.register(
    "logger",
    { logger },
    {
      version: "1.0.0",
      description: "Centralized logging service",
      tags: ["core", "logging"],
      singleton: true,
      lazy: false,
      priority: 100,
      healthCheck: async () => ({ status: "healthy", uptime: process.uptime() }),
    }
  );

  // Usage validator
  serviceRegistry.register("usageValidator", usageValidator, {
    version: "1.0.0",
    description: "Usage validation and tracking service",
    dependencies: ["logger"],
    tags: ["core", "validation"],
    healthCheck: async () => ({ status: "healthy" }),
  });

  // AI
  serviceRegistry.register("ai", aiService, {
    version: "2.0.0",
    description: "OpenAI integration service",
    dependencies: ["logger", "usageValidator"],
    tags: ["ai", "external-api"],
    timeout: 120000,
    healthCheck: async () => {
      const isValid = await aiService.validateApiKey();
      return { status: isValid ? "healthy" : "unhealthy", apiConnection: isValid };
    },
  });

  // Billing
  serviceRegistry.register("billing", billingService, {
    version: "1.0.0",
    description: "Billing and subscription management",
    dependencies: ["logger"],
    tags: ["billing", "stripe"],
    healthCheck: async () => ({ status: "healthy" }),
  });

  // Initialize critical services
  await serviceRegistry.initialize("ai");
  await serviceRegistry.initialize("billing");

  // Optional services
  await registerOptionalService("massGenerator", "./massGenerator.js", {
    description: "Mass page generation helper",
    dependencies: ["logger", "usageValidator"],
    tags: ["generation"],
    initialize: false,
  });

  await registerOptionalService("email", "./email.js", {
    description: "Email delivery service (SMTP/SendGrid)",
    dependencies: ["logger"],
    tags: ["email", "notifications"],
    healthCheck: async () => {
      try {
        const email = await serviceRegistry.get("email");
        if (typeof email?.ping === "function") {
          const ok = await email.ping();
          return { status: ok ? "healthy" : "unhealthy" };
        }
        return { status: "healthy" };
      } catch {
        return { status: "unhealthy" };
      }
    },
  });

  await registerOptionalService("cache", "./cache.js", {
    description: "Cache layer (Redis)",
    dependencies: ["logger"],
    tags: ["cache"],
    initialize: true,
    healthCheck: async () => {
      try {
        const cache = await serviceRegistry.get("cache");
        if (typeof cache?.ping === "function") {
          const ok = await cache.ping();
          return { status: ok ? "healthy" : "unhealthy" };
        }
        return { status: "healthy" };
      } catch {
        return { status: "unhealthy" };
      }
    },
  });

  await registerOptionalService("queue", "./queue.js", {
    description: "Background job queue (BullMQ/RabbitMQ)",
    dependencies: ["logger"],
    tags: ["queue", "background-jobs"],
    initialize: true,
    healthCheck: async () => {
      try {
        const queue = await serviceRegistry.get("queue");
        if (typeof queue?.health === "function") {
          return await queue.health(); // expected { status: 'healthy'|'unhealthy', ... }
        }
        return { status: "healthy" };
      } catch {
        return { status: "unhealthy" };
      }
    },
  });

  logger.info("All services bootstrapped", serviceRegistry.getStatus());
}