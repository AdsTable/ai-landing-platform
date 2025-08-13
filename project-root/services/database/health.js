import mongoose from "mongoose";
import { logger } from "../logger.js";

class DatabaseHealthService {
    constructor() {
        this.checks = [];
        this.lastHealthCheck = null;
        this.healthStatus = 'unknown';
    }

    /**
     * Register health check
     */
    registerCheck(name, checkFn, critical = false) {
        this.checks.push({
            name,
            checkFn,
            critical,
            lastResult: null,
            lastRun: null
        });
    }

    /**
     * Initialize default health checks
     */
    async initialize() {
        // Connection status check
        this.registerCheck('connection', async () => {
            const state = mongoose.connection.readyState;
            const states = {
                0: 'disconnected',
                1: 'connected', 
                2: 'connecting',
                3: 'disconnecting'
            };
            
            return {
                healthy: state === 1,
                details: {
                    state: states[state] || 'unknown',
                    host: mongoose.connection.host,
                    port: mongoose.connection.port,
                    name: mongoose.connection.name
                }
            };
        }, true);

        // Database ping check
        this.registerCheck('ping', async () => {
            const start = Date.now();
            await mongoose.connection.db.admin().ping();
            const duration = Date.now() - start;
            
            return {
                healthy: duration < 1000, // Healthy if ping < 1s
                details: {
                    duration: `${duration}ms`,
                    threshold: '1000ms'
                }
            };
        }, true);

        // Collections check
        this.registerCheck('collections', async () => {
            const collections = await mongoose.connection.db.listCollections().toArray();
            const requiredCollections = ['users', 'plans', 'tenants'];
            const existingCollections = collections.map(c => c.name);
            const missingCollections = requiredCollections.filter(c => !existingCollections.includes(c));
            
            return {
                healthy: missingCollections.length === 0,
                details: {
                    total: collections.length,
                    required: requiredCollections,
                    missing: missingCollections
                }
            };
        });

        // Indexes check
        this.registerCheck('indexes', async () => {
            try {
                const usersIndexes = await mongoose.connection.db.collection('users').indexes();
                const hasEmailIndex = usersIndexes.some(idx => idx.key && idx.key.email);
                const hasUsernameIndex = usersIndexes.some(idx => idx.key && idx.key.username);
                
                return {
                    healthy: hasEmailIndex && hasUsernameIndex,
                    details: {
                        usersIndexes: usersIndexes.length,
                        hasEmailIndex,
                        hasUsernameIndex
                    }
                };
            } catch (error) {
                return {
                    healthy: false,
                    details: { error: error.message }
                };
            }
        });

        // Storage check
        this.registerCheck('storage', async () => {
            const stats = await mongoose.connection.db.stats();
            const storageUsedGB = (stats.dataSize / (1024 * 1024 * 1024)).toFixed(2);
            const storageSizeGB = (stats.storageSize / (1024 * 1024 * 1024)).toFixed(2);
            
            return {
                healthy: stats.dataSize < (10 * 1024 * 1024 * 1024), // Healthy if < 10GB
                details: {
                    dataSize: `${storageUsedGB}GB`,
                    storageSize: `${storageSizeGB}GB`,
                    collections: stats.collections,
                    objects: stats.objects,
                    avgObjSize: stats.avgObjSize
                }
            };
        });

        // Performance check
        this.registerCheck('performance', async () => {
            const start = Date.now();
            await mongoose.connection.db.collection('users').findOne({});
            const queryDuration = Date.now() - start;
            
            return {
                healthy: queryDuration < 100, // Healthy if query < 100ms
                details: {
                    queryDuration: `${queryDuration}ms`,
                    threshold: '100ms'
                }
            };
        });

        logger.info('Database health checks initialized', { 
            checksCount: this.checks.length 
        });
    }

    /**
     * Run all health checks
     */
    async runHealthChecks() {
        const startTime = Date.now();
        const results = {};
        let overallHealthy = true;
        let criticalFailures = 0;

        logger.info('Running database health checks');

        for (const check of this.checks) {
            try {
                const result = await check.checkFn();
                
                results[check.name] = {
                    ...result,
                    critical: check.critical,
                    duration: Date.now() - startTime
                };

                check.lastResult = result;
                check.lastRun = new Date();

                if (!result.healthy) {
                    overallHealthy = false;
                    if (check.critical) {
                        criticalFailures++;
                    }
                }

                logger.debug('Health check completed', {
                    check: check.name,
                    healthy: result.healthy,
                    critical: check.critical
                });

            } catch (error) {
                results[check.name] = {
                    healthy: false,
                    error: error.message,
                    critical: check.critical,
                    duration: Date.now() - startTime
                };

                check.lastResult = { healthy: false, error: error.message };
                check.lastRun = new Date();

                overallHealthy = false;
                if (check.critical) {
                    criticalFailures++;
                }

                logger.error('Health check failed', {
                    check: check.name,
                    error: error.message
                });
            }
        }

        const healthReport = {
            overall: {
                healthy: overallHealthy,
                status: this.getHealthStatus(overallHealthy, criticalFailures),
                timestamp: new Date(),
                duration: Date.now() - startTime,
                criticalFailures
            },
            checks: results,
            summary: {
                total: this.checks.length,
                passed: Object.values(results).filter(r => r.healthy).length,
                failed: Object.values(results).filter(r => !r.healthy).length,
                critical: this.checks.filter(c => c.critical).length
            }
        };

        this.lastHealthCheck = healthReport;
        this.healthStatus = healthReport.overall.status;

        logger.info('Database health check completed', {
            status: this.healthStatus,
            passed: healthReport.summary.passed,
            failed: healthReport.summary.failed,
            duration: healthReport.overall.duration
        });

        return healthReport;
    }

    /**
     * Get health status string
     */
    getHealthStatus(healthy, criticalFailures) {
        if (criticalFailures > 0) {
            return 'critical';
        } else if (!healthy) {
            return 'degraded';
        } else {
            return 'healthy';
        }
    }

    /**
     * Get last health check result
     */
    getLastHealthCheck() {
        return this.lastHealthCheck;
    }

    /**
     * Get current health status
     */
    getCurrentStatus() {
        return {
            status: this.healthStatus,
            lastCheck: this.lastHealthCheck?.overall?.timestamp,
            uptime: process.uptime()
        };
    }

    /**
     * Schedule periodic health checks
     */
    scheduleHealthChecks(intervalMinutes = 5) {
        setInterval(async () => {
            try {
                await this.runHealthChecks();
            } catch (error) {
                logger.error('Scheduled health check failed', { 
                    error: error.message 
                });
            }
        }, intervalMinutes * 60 * 1000);

        logger.info('Periodic health checks scheduled', { 
            intervalMinutes 
        });
    }

    /**
     * Get health metrics for monitoring
     */
    getHealthMetrics() {
        if (!this.lastHealthCheck) {
            return null;
        }

        const checks = this.lastHealthCheck.checks;
        return {
            database_health_overall: this.healthStatus === 'healthy' ? 1 : 0,
            database_health_critical_failures: this.lastHealthCheck.overall.criticalFailures,
            database_connection_healthy: checks.connection?.healthy ? 1 : 0,
            database_ping_duration: checks.ping?.details?.duration ? parseInt(checks.ping.details.duration) : null,
            database_collections_count: checks.collections?.details?.total || 0,
            database_storage_size_gb: checks.storage?.details?.dataSize ? parseFloat(checks.storage.details.dataSize) : null
        };
    }
}

export const dbHealthService = new DatabaseHealthService();
export default dbHealthService;
