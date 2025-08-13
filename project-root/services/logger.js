import fs from 'fs';
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// Create different log levels
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    transports: [
        // Console logging
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        
        // File logging - errors only
        new DailyRotateFile({
            filename: 'logs/error-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            maxSize: '20m',
            maxFiles: '14d'
        }),
        
        // File logging - all levels
        new DailyRotateFile({
            filename: 'logs/app-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '7d'
        })
    ]
});

// Security events logging
export const securityLogger = winston.createLogger({
    level: 'info',
    format: logFormat,
    transports: [
        new DailyRotateFile({
            filename: 'logs/security-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '30d'
        })
    ]
});

// AI operations logging
export const aiLogger = winston.createLogger({
    level: 'info',
    format: logFormat,
    transports: [
        new DailyRotateFile({
            filename: 'logs/ai-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '50m',
            maxFiles: '30d'
        })
    ]
});

export { logger };

// Log user actions to file
export function logAction(user, action, details) {
    const logLine = `${new Date().toISOString()} | ${user.username} (${user.role}) | ${action} | ${details}\n`;
    fs.appendFileSync('logs/actions.log', logLine);
}
