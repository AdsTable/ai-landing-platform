import { logger } from "../services/logger.js";

// Global error handler
export const globalErrorHandler = (err, req, res, next) => {
    // Log error details
    logger.error('Global error:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id
    });

    // Don't leak error details in production
    const isDev = process.env.NODE_ENV === 'development';
    
    // Handle specific error types
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            ...(isDev && { details: err.message })
        });
    }

    if (err.name === 'CastError') {
        return res.status(400).json({
            success: false,
            message: 'Invalid ID format',
            ...(isDev && { details: err.message })
        });
    }

    if (err.code === 11000) {
        return res.status(409).json({
            success: false,
            message: 'Duplicate entry',
            ...(isDev && { details: err.message })
        });
    }

    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }

    // Default server error
    res.status(err.statusCode || 500).json({
        success: false,
        message: isDev ? err.message : 'Internal server error',
        ...(isDev && { stack: err.stack })
    });
};

// 404 handler
export const notFoundHandler = (req, res) => {
    logger.warn(`404 - Route not found: ${req.method} ${req.url}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
};

// Async error wrapper
export const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
