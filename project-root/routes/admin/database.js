import express from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { body } from "express-validator";
import { handleValidationErrors } from "../../middleware/validation.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { migrationService } from "../../services/database/migrations.js";
import { seedService } from "../../services/database/seed.js";
import { backupService } from "../../services/database/backup.js";
import { dbHealthService } from "../../services/database/health.js";
import settings from "../../config/settings.js";

const router = express.Router();

// Validation
const validateMigrationName = [
    body('name')
        .isString()
        .trim()
        .isLength({ min: 1, max: 100 })
        .matches(/^[a-zA-Z0-9_-]+$/)
        .withMessage('Migration name must be alphanumeric with underscores/hyphens only'),
    handleValidationErrors
];

const validateBackupDescription = [
    body('description')
        .optional()
        .isString()
        .trim()
        .isLength({ max: 200 })
        .withMessage('Description must be less than 200 characters'),
    handleValidationErrors
];

/**
 * GET /admin/database - Main database management dashboard
 */
router.get("/database", 
    requireAuth, 
    requireRole("admin"), 
    asyncHandler(async (req, res) => {
        // Initialize services
        await migrationService.initialize();
        await backupService.initialize();
        await dbHealthService.initialize();

        // Get status from all services
        const [migrationStatus, backups, healthStatus] = await Promise.all([
            migrationService.getStatus(),
            backupService.listBackups(),
            dbHealthService.runHealthChecks()
        ]);

        const seedStatus = await seedService.isSeeded();

        res.render("admin/database", {
            title: "Database Management",
            siteName: settings.siteName,
            user: req.user,
            currentPage: 'database',
            migrationStatus,
            backups: backups.slice(0, 5), // Show last 5 backups
            healthStatus,
            seedStatus,
            VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY
        });
    })
);

/**
 * GET /admin/database/migrations - Migrations management page
 */
router.get("/database/migrations", 
    requireAuth, 
    requireRole("admin"), 
    asyncHandler(async (req, res) => {
        await migrationService.initialize();
        const status = await migrationService.getStatus();

        res.render("admin/database/migrations", {
            title: "Database Migrations",
            siteName: settings.siteName,
            user: req.user,
            currentPage: 'database',
            migrationStatus: status,
            VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY
        });
    })
);

/**
 * POST /admin/database/migrations/create - Create new migration
 */
router.post("/database/migrations/create",
    requireAuth,
    requireRole("admin"),
    validateMigrationName,
    asyncHandler(async (req, res) => {
        const { name } = req.body;
        
        await migrationService.initialize();
        const result = await migrationService.createMigration(name);

        res.json({
            success: true,
            message: "Migration created successfully",
            migration: result
        });
    })
);

/**
 * POST /admin/database/migrations/run - Run pending migrations
 */
router.post("/database/migrations/run",
    requireAuth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
        await migrationService.initialize();
        const result = await migrationService.runMigrations();

        res.json({
            success: true,
            message: `Executed ${result.executed} migrations`,
            result
        });
    })
);

/**
 * POST /admin/database/migrations/rollback - Rollback migrations
 */
router.post("/database/migrations/rollback",
    requireAuth,
    requireRole("admin"),
    body('steps').optional().isInt({ min: 1, max: 10 }).withMessage('Steps must be 1-10'),
    handleValidationErrors,
    asyncHandler(async (req, res) => {
        const steps = parseInt(req.body.steps) || 1;
        
        await migrationService.initialize();
        const result = await migrationService.rollbackMigrations(steps);

        res.json({
            success: true,
            message: `Rolled back ${result.rolledBack} migrations`,
            result
        });
    })
);

/**
 * GET /admin/database/backups - Backups management page
 */
router.get("/database/backups", 
    requireAuth, 
    requireRole("admin"), 
    asyncHandler(async (req, res) => {
        await backupService.initialize();
        const backups = await backupService.listBackups();

        res.render("admin/database/backups", {
            title: "Database Backups",
            siteName: settings.siteName,
            user: req.user,
            currentPage: 'database',
            backups,
            VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY
        });
    })
);

/**
 * POST /admin/database/backups/create - Create backup
 */
router.post("/database/backups/create",
    requireAuth,
    requireRole("admin"),
    validateBackupDescription,
    asyncHandler(async (req, res) => {
        const { description } = req.body;
        
        await backupService.initialize();
        
        // Start backup process (async)
        backupService.createBackup(description || 'Manual backup')
            .then(backup => {
                // Could emit socket event here for real-time updates
                console.log('Backup completed:', backup.filename);
            })
            .catch(error => {
                console.error('Backup failed:', error.message);
            });

        res.json({
            success: true,
            message: "Backup creation started. This may take a few minutes."
        });
    })
);

/**
 * POST /admin/database/backups/restore - Restore from backup
 */
router.post("/database/backups/restore",
    requireAuth,
    requireRole("admin"),
    body('filename').isString().trim().notEmpty().withMessage('Filename required'),
    handleValidationErrors,
    asyncHandler(async (req, res) => {
        const { filename } = req.body;
        
        await backupService.initialize();
        
        // Start restore process (async)
        backupService.restoreBackup(filename)
            .then(result => {
                console.log('Restore completed:', result);
            })
            .catch(error => {
                console.error('Restore failed:', error.message);
            });

        res.json({
            success: true,
            message: "Restore process started. This may take a few minutes.",
            warning: "This will overwrite all current data!"
        });
    })
);

/**
 * DELETE /admin/database/backups/:filename - Delete backup
 */
router.delete("/database/backups/:filename",
    requireAuth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
        const { filename } = req.params;
        
        await backupService.initialize();
        await backupService.deleteBackup(filename);

        res.json({
            success: true,
            message: "Backup deleted successfully"
        });
    })
);

/**
 * GET /admin/database/health - Health monitoring page
 */
router.get("/database/health", 
    requireAuth, 
    requireRole("admin"), 
    asyncHandler(async (req, res) => {
        await dbHealthService.initialize();
        const healthStatus = await dbHealthService.runHealthChecks();

        res.render("admin/database/health", {
            title: "Database Health",
            siteName: settings.siteName,
            user: req.user,
            currentPage: 'database',
            healthStatus,
            VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY
        });
    })
);

/**
 * POST /admin/database/health/check - Run health checks
 */
router.post("/database/health/check",
    requireAuth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
        await dbHealthService.initialize();
        const healthStatus = await dbHealthService.runHealthChecks();

        res.json({
            success: true,
            healthStatus
        });
    })
);

/**
 * GET /admin/database/seed - Seed management page
 */
router.get("/database/seed", 
    requireAuth, 
    requireRole("admin"), 
    asyncHandler(async (req, res) => {
        const isSeeded = await seedService.isSeeded();

        res.render("admin/database/seed", {
            title: "Database Seed",
            siteName: settings.siteName,
            user: req.user,
            currentPage: 'database',
            isSeeded,
            VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY
        });
    })
);

/**
 * POST /admin/database/seed/run - Run database seed
 */
router.post("/database/seed/run",
    requireAuth,
    requireRole("admin"),
    body('force').optional().isBoolean().withMessage('Force must be boolean'),
    handleValidationErrors,
    asyncHandler(async (req, res) => {
        const force = req.body.force === true;
        
        const result = await seedService.seedDatabase(force);

        res.json({
            success: true,
            message: result.seeded ? "Database seeded successfully" : "Database already seeded",
            result
        });
    })
);

/**
 * POST /admin/database/seed/clear - Clear seed data
 */
router.post("/database/seed/clear",
    requireAuth,
    requireRole("admin"),
    asyncHandler(async (req, res) => {
        await seedService.clearSeedData();

        res.json({
            success: true,
            message: "Seed data cleared successfully",
            warning: "All users, plans, and tenants have been deleted!"
        });
    })
);

export default router;
