import { logger, securityLogger } from "../services/logger.js";

// Request logging middleware
export const requestLogger = (req, res, next) => {
    const start = Date.now();
    
    // Log request start
    logger.info('Request started', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id
    });

    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function(...args) {
        const duration = Date.now() - start;
        
        logger.info('Request completed', {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration,
            ip: req.ip,
            userId: req.user?.id
        });

        // Log slow requests
        if (duration > 5000) {
            logger.warn('Slow request detected', {
                method: req.method,
                url: req.url,
                duration,
                statusCode: res.statusCode
            });
        }

        originalEnd.apply(this, args);
    };

    next();
};

// Security events monitoring
export const securityMonitor = {
    logFailedLogin: (ip, email) => {
        securityLogger.warn('Failed login attempt', { ip, email, timestamp: new Date() });
    },
    
    logSuspiciousActivity: (userId, activity, details) => {
        securityLogger.warn('Suspicious activity', { userId, activity, details, timestamp: new Date() });
    },
    
    logRateLimitExceeded: (ip, endpoint) => {
        securityLogger.warn('Rate limit exceeded', { ip, endpoint, timestamp: new Date() });
    }
};

// Health check endpoint data
export const healthMetrics = {
    startTime: Date.now(),
    requests: 0,
    errors: 0,
    
    incrementRequests() {
        this.requests++;
    },
    
    incrementErrors() {
        this.errors++;
    },
    
    getUptime() {
        return Math.floor((Date.now() - this.startTime) / 1000);
    },
    
    getMetrics() {
        return {
            uptime: this.getUptime(),
            requests: this.requests,
            errors: this.errors,
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
        };
    }
};
