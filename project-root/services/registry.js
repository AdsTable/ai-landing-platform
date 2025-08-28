import { logger } from "./logger.js";
import { EventEmitter } from "events";

/**
 * Enterprise Service Registry - Advanced dependency injection container
 * Features: Health monitoring, metrics, hot-reload, service discovery
 * @version 2.0.0 (2025 Edition)
 */
class ServiceRegistry extends EventEmitter {
    constructor() {
        super();
        
        // Core registry state
        this.services = new Map();
        this.dependencies = new Map();
        this.initialized = new Set();
        this.initializing = new Set();
        
        // Enhanced features
        this.metadata = new Map();           // Service metadata (version, health, etc.)
        this.instances = new Map();          // Actual service instances
        this.healthChecks = new Map();       // Health check functions
        this.initializationOrder = [];       // Track initialization sequence
        this.metrics = {                     // Performance metrics
            initializations: 0,
            failures: 0,
            averageInitTime: 0,
            totalUptime: Date.now()
        };
        
        // Configuration
        this.config = {
            healthCheckInterval: 30000,      // 30 seconds
            initializationTimeout: 60000,   // 60 seconds  
            maxRetries: 3,                  // Max initialization retries
            gracefulShutdownTimeout: 30000  // 30 seconds
        };
        
        // Start health monitoring
        this.startHealthMonitoring();
        
        logger.info('Enhanced Service Registry initialized', {
            version: '2.0.0',
            features: ['health-monitoring', 'metrics', 'hot-reload', 'service-discovery']
        });
    }

    /**
     * Register service with enhanced metadata and configuration
     * @param {string} name - Service name (must be unique)
     * @param {Object} serviceModule - Service class or module
     * @param {Object} options - Registration options
     */
    register(name, serviceModule, options = {}) {
        const {
            dependencies = [],
            version = '1.0.0',
            description = '',
            tags = [],
            singleton = true,
            lazy = false,
            healthCheck = null,
            priority = 0,
            timeout = this.config.initializationTimeout
        } = options;

        // Validate service name
        if (!name || typeof name !== 'string') {
            throw new Error('Service name must be a non-empty string');
        }
        
        if (this.services.has(name)) {
            logger.warn('Service already registered, updating', { service: name });
            this.emit('service:updated', { name, previousVersion: this.metadata.get(name)?.version });
        }

        // Store service and metadata
        this.services.set(name, serviceModule);
        this.dependencies.set(name, dependencies);
        this.metadata.set(name, {
            version,
            description,
            tags,
            singleton,
            lazy,
            timeout,
            priority,
            registeredAt: new Date().toISOString(),
            status: 'registered'
        });

        // Store health check if provided
        if (healthCheck && typeof healthCheck === 'function') {
            this.healthChecks.set(name, healthCheck);
        }

        logger.info('Service registered with enhanced features', { 
            service: name,
            version,
            dependencies,
            tags,
            singleton,
            lazy
        });

        this.emit('service:registered', { name, metadata: this.metadata.get(name) });

        // Auto-initialize if not lazy and no dependencies
        if (!lazy && dependencies.length === 0) {
            setImmediate(() => this.initialize(name).catch(err => 
                logger.error('Auto-initialization failed', { service: name, error: err.message })
            ));
        }
    }

    /**
     * Enhanced service initialization with timeout, retries, and monitoring
     */
    async initialize(serviceName, options = {}) {
        const { force = false, retries = this.config.maxRetries } = options;
        
        // Return cached instance if already initialized
        if (!force && this.initialized.has(serviceName)) {
            return this.instances.get(serviceName) || this.services.get(serviceName);
        }

        // Detect circular dependencies
        if (this.initializing.has(serviceName)) {
            const initPath = Array.from(this.initializing).join(' -> ') + ` -> ${serviceName}`;
            throw new Error(`Circular dependency detected: ${initPath}`);
        }

        const startTime = Date.now();
        const metadata = this.metadata.get(serviceName);
        
        if (!metadata) {
            throw new Error(`Service '${serviceName}' not registered`);
        }

        this.initializing.add(serviceName);
        metadata.status = 'initializing';

        try {
            logger.info('Starting service initialization', { 
                service: serviceName,
                attempt: this.config.maxRetries - retries + 1,
                timeout: metadata.timeout
            });

            // Initialize with timeout
            const initPromise = this.performInitialization(serviceName);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error(`Service initialization timeout: ${serviceName}`)), 
                metadata.timeout)
            );

            const instance = await Promise.race([initPromise, timeoutPromise]);
            
            // Track successful initialization
            const initTime = Date.now() - startTime;
            this.updateInitializationMetrics(true, initTime);
            this.initializationOrder.push({
                service: serviceName,
                timestamp: new Date().toISOString(),
                duration: initTime
            });

            this.initialized.add(serviceName);
            this.initializing.delete(serviceName);
            this.instances.set(serviceName, instance);
            
            metadata.status = 'running';
            metadata.lastInitialized = new Date().toISOString();
            metadata.initializationTime = initTime;

            logger.info('Service initialized successfully', { 
                service: serviceName,
                duration: initTime,
                totalServices: this.initialized.size
            });

            this.emit('service:initialized', { 
                name: serviceName, 
                instance, 
                duration: initTime 
            });

            return instance;

        } catch (error) {
            this.initializing.delete(serviceName);
            metadata.status = 'failed';
            metadata.lastError = error.message;
            
            this.updateInitializationMetrics(false, Date.now() - startTime);

            logger.error('Service initialization failed', { 
                service: serviceName, 
                error: error.message,
                attempt: this.config.maxRetries - retries + 1,
                retriesLeft: retries
            });

            // Retry if attempts remain
            if (retries > 0) {
                logger.info('Retrying service initialization', { service: serviceName, retriesLeft: retries });
                await new Promise(resolve => setTimeout(resolve, 1000 * (this.config.maxRetries - retries + 1)));
                return this.initialize(serviceName, { force, retries: retries - 1 });
            }

            this.emit('service:failed', { name: serviceName, error: error.message });
            throw error;
        }
    }

    /**
     * Perform actual service initialization with dependency resolution
     */
    async performInitialization(serviceName) {
        // Initialize dependencies first (topological sort)
        const deps = this.dependencies.get(serviceName) || [];
        const sortedDeps = this.topologicalSort(deps);
        
        for (const dep of sortedDeps) {
            await this.initialize(dep);
        }

        // Get service and create instance
        const ServiceClass = this.services.get(serviceName);
        const metadata = this.metadata.get(serviceName);
        
        if (!ServiceClass) {
            throw new Error(`Service class not found: ${serviceName}`);
        }

        let instance;
        
        // Handle different service types
        if (typeof ServiceClass === 'function') {
            if (metadata.singleton) {
                // Singleton pattern
                if (this.instances.has(serviceName)) {
                    return this.instances.get(serviceName);
                }
                instance = new ServiceClass();
            } else {
                // Factory pattern
                instance = () => new ServiceClass();
            }
        } else {
            // Module or object
            instance = ServiceClass;
        }

        // Call initialize method if available
        if (instance && typeof instance.initialize === 'function') {
            await instance.initialize();
        }

        return instance;
    }

    /**
     * Topological sort for dependency resolution
     */
    topologicalSort(dependencies) {
        const visited = new Set();
        const result = [];
        
        const visit = (serviceName) => {
            if (visited.has(serviceName)) return;
            visited.add(serviceName);
            
            const deps = this.dependencies.get(serviceName) || [];
            deps.forEach(visit);
            result.push(serviceName);
        };

        dependencies.forEach(visit);
        return result;
    }

    /**
     * Enhanced service getter with fallbacks and monitoring
     */
    async get(serviceName, options = {}) {
        const { 
            fallback = null, 
            timeout = 10000,
            required = false 
        } = options;

        try {
            // Quick path for already initialized services
            if (this.initialized.has(serviceName)) {
                const instance = this.instances.get(serviceName) || this.services.get(serviceName);
                this.emit('service:accessed', { name: serviceName, timestamp: Date.now() });
                return instance;
            }

            // Initialize with timeout
            const initPromise = this.initialize(serviceName);
            const timeoutPromise = new Promise((resolve) => 
                setTimeout(() => resolve(null), timeout)
            );

            const instance = await Promise.race([initPromise, timeoutPromise]);
            
            if (!instance && required) {
                throw new Error(`Required service '${serviceName}' not available`);
            }

            return instance || fallback;

        } catch (error) {
            logger.warn('Service access failed', { 
                service: serviceName, 
                error: error.message,
                fallbackProvided: !!fallback
            });

            if (required) {
                throw error;
            }

            this.emit('service:access_failed', { name: serviceName, error: error.message });
            return fallback;
        }
    }

    /**
     * Check service health status
     */
    async checkHealth(serviceName) {
        if (!this.initialized.has(serviceName)) {
            return { status: 'down', reason: 'Service not initialized' };
        }

        const healthCheck = this.healthChecks.get(serviceName);
        if (!healthCheck) {
            return { status: 'unknown', reason: 'No health check configured' };
        }

        try {
            const result = await Promise.race([
                healthCheck(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Health check timeout')), 5000)
                )
            ]);

            return result || { status: 'healthy' };

        } catch (error) {
            logger.warn('Health check failed', { service: serviceName, error: error.message });
            return { 
                status: 'unhealthy', 
                reason: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get comprehensive service status
     */
    getStatus() {
        const services = {};
        
        for (const [name, metadata] of this.metadata) {
            services[name] = {
                ...metadata,
                initialized: this.initialized.has(name),
                initializing: this.initializing.has(name),
                hasHealthCheck: this.healthChecks.has(name),
                dependencies: this.dependencies.get(name) || []
            };
        }

        return {
            registry: {
                totalServices: this.services.size,
                initializedServices: this.initialized.size,
                failedServices: Array.from(this.metadata.values()).filter(m => m.status === 'failed').length,
                uptime: Date.now() - this.metrics.totalUptime,
                version: '2.0.0'
            },
            services,
            metrics: { ...this.metrics },
            initializationOrder: [...this.initializationOrder]
        };
    }

    /**
     * Start periodic health monitoring
     */
    startHealthMonitoring() {
        if (this.healthMonitorInterval) {
            clearInterval(this.healthMonitorInterval);
        }

        this.healthMonitorInterval = setInterval(async () => {
            for (const serviceName of this.initialized) {
                try {
                    const health = await this.checkHealth(serviceName);
                    if (health.status === 'unhealthy') {
                        this.emit('service:unhealthy', { name: serviceName, health });
                    }
                } catch (error) {
                    logger.error('Health monitoring error', { 
                        service: serviceName, 
                        error: error.message 
                    });
                }
            }
        }, this.config.healthCheckInterval);

        logger.info('Health monitoring started', { 
            interval: this.config.healthCheckInterval 
        });
    }

    /**
     * Update initialization metrics
     */
    updateInitializationMetrics(success, duration) {
        this.metrics.initializations++;
        
        if (!success) {
            this.metrics.failures++;
        }

        // Calculate rolling average
        const totalInits = this.metrics.initializations;
        this.metrics.averageInitTime = 
            (this.metrics.averageInitTime * (totalInits - 1) + duration) / totalInits;
    }

    /**
     * Hot reload a service (development/testing feature)
     */
    async reload(serviceName) {
        if (!this.services.has(serviceName)) {
            throw new Error(`Service '${serviceName}' not registered`);
        }

        logger.info('Hot reloading service', { service: serviceName });

        // Shutdown existing instance
        await this.shutdownService(serviceName);
        
        // Remove from initialized set
        this.initialized.delete(serviceName);
        this.instances.delete(serviceName);
        
        // Re-initialize
        const instance = await this.initialize(serviceName, { force: true });
        
        this.emit('service:reloaded', { name: serviceName, instance });
        
        return instance;
    }

    /**
     * Shutdown a specific service
     */
    async shutdownService(serviceName) {
        const instance = this.instances.get(serviceName);
        
        if (instance && typeof instance.shutdown === 'function') {
            try {
                await Promise.race([
                    instance.shutdown(),
                    new Promise((resolve) => 
                        setTimeout(resolve, this.config.gracefulShutdownTimeout)
                    )
                ]);
                logger.info('Service shutdown completed', { service: serviceName });
            } catch (error) {
                logger.error('Service shutdown failed', { 
                    service: serviceName, 
                    error: error.message 
                });
            }
        }

        this.initialized.delete(serviceName);
        this.instances.delete(serviceName);
        
        const metadata = this.metadata.get(serviceName);
        if (metadata) {
            metadata.status = 'stopped';
            metadata.stoppedAt = new Date().toISOString();
        }
    }

    /**
     * Graceful shutdown of all services
     */
    async shutdown() {
        logger.info('Starting graceful registry shutdown', {
            servicesToShutdown: this.initialized.size
        });

        // Clear health monitoring
        if (this.healthMonitorInterval) {
            clearInterval(this.healthMonitorInterval);
            this.healthMonitorInterval = null;
        }

        // Shutdown services in reverse initialization order
        const shutdownOrder = [...this.initializationOrder].reverse();
        
        for (const { service: serviceName } of shutdownOrder) {
            if (this.initialized.has(serviceName)) {
                await this.shutdownService(serviceName);
            }
        }

        // Clear all state
        this.services.clear();
        this.dependencies.clear();
        this.metadata.clear();
        this.instances.clear();
        this.healthChecks.clear();
        this.initialized.clear();
        this.initializing.clear();
        this.initializationOrder.length = 0;

        this.emit('registry:shutdown');
        
        logger.info('Registry shutdown completed');
    }

    /**
     * Service discovery - find services by tags or criteria
     */
    discover(criteria = {}) {
        const { tags = [], status = null, version = null } = criteria;
        const results = [];

        for (const [name, metadata] of this.metadata) {
            let matches = true;

            // Filter by tags
            if (tags.length > 0) {
                const serviceTags = metadata.tags || [];
                matches = matches && tags.every(tag => serviceTags.includes(tag));
            }

            // Filter by status
            if (status && metadata.status !== status) {
                matches = false;
            }

            // Filter by version
            if (version && metadata.version !== version) {
                matches = false;
            }

            if (matches) {
                results.push({
                    name,
                    ...metadata,
                    initialized: this.initialized.has(name)
                });
            }
        }

        return results;
    }
}

// Export enhanced singleton instance
export const serviceRegistry = new ServiceRegistry();
export default serviceRegistry;