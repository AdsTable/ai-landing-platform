import { securityLogger } from "../services/logger.js";

export const requireAuth = (req, res, next) => {
    if (!req.user) {
        securityLogger.warn('Unauthorized access attempt', {
            url: req.url,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        
        // For API routes, return JSON
        if (req.url.startsWith('/api/')) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        
        // For web routes, redirect to login
        return res.redirect('/auth/login');
    }
    next();
};

export const requireRole = (role) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        
        if (req.user.role !== role) {
            securityLogger.warn('Insufficient permissions', {
                userId: req.user.id,
                requiredRole: role,
                userRole: req.user.role,
                url: req.url,
                ip: req.ip
            });
            
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions'
            });
        }
        
        next();
    };
};

// Optional auth for mixed routes
export const optionalAuth = (req, res, next) => {
    // User already loaded by middleware in server.js
    next();
};
