import { logger } from "./logger.js";

/**
 * Service Registry - manages service dependencies and lifecycle
 */
class ServiceRegistry {
    constructor() {
        this.services = new Map();
        this.dependencies = new Map();
        this.initialized = new Set();
        this.initializing = new Set();
    }

    /**
     * Register service with its dependencies
     */
    register(name, serviceModule, dependencies = []) {
        this.services.set(name, serviceModule);
        this.dependencies.set(name, dependencies);
        
        logger.info('Service registered', { 
            service: name, 
            dependencies: dependencies 
        });
    }

    /**
     * Initialize service with dependency resolution
     */
    async initialize(serviceName) {
        if (this.initialized.has(serviceName)) {
            return this.services.get(serviceName);
        }

        if (this.initializing.has(serviceName)) {
            throw new Error(`Circular dependency detected: ${serviceName}`);
        }

        this.initializing.add(serviceName);

        try {
            // Initialize dependencies first
            const deps = this.dependencies.get(serviceName) || [];
            for (const dep of deps) {
                await this.initialize(dep);
            }

            // Initialize the service
            const service = this.services.get(serviceName);
            if (service && typeof service.initialize === 'function') {
                await service.initialize();
            }

            this.initialized.add(serviceName);
            this.initializing.delete(serviceName);

            logger.info('Service initialized', { service: serviceName });
            return service;

        } catch (error) {
            this.initializing.delete(serviceName);
            logger.error('Service initialization failed', { 
                service: serviceName, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * Get service (initialize if needed)
     */
    async get(serviceName) {
        try {
            return await this.initialize(serviceName);
        } catch (error) {
            // Return null if service not available (graceful degradation)
            logger.warn('Service not available', { 
                service: serviceName, 
                error: error.message 
            });
            return null;
        }
    }

    /**
     * Check if service is available
     */
    isAvailable(serviceName) {
        return this.initialized.has(serviceName);
    }

    /**
     * Get service status
     */
    getStatus() {
        const status = {};
        for (const [name] of this.services) {
            status[name] = {
                initialized: this.initialized.has(name),
                initializing: this.initializing.has(name)
            };
        }
        return status;
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        for (const [name, service] of this.services) {
            try {
                if (typeof service.shutdown === 'function') {
                    await service.shutdown();
                }
                logger.info('Service shutdown', { service: name });
            } catch (error) {
                logger.error('Service shutdown failed', { 
                    service: name, 
                    error: error.message 
                });
            }
        }
        
        // Clear all registrations
        this.services.clear();
        this.dependencies.clear();
        this.initialized.clear();
        this.initializing.clear();
    }
}

// Export singleton instance
export const serviceRegistry = new ServiceRegistry();
export default serviceRegistry;
