import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { logger } from "../logger.js";

// Migration Schema
const migrationSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    batch: { type: Number, required: true },
    executedAt: { type: Date, default: Date.now }
});

const Migration = mongoose.model('Migration', migrationSchema);

class MigrationService {
    constructor() {
        this.migrationsPath = path.resolve('migrations');
        this.currentBatch = 1;
    }

    /**
     * Initialize migrations directory and tracking
     */
    async initialize() {
        // Ensure migrations directory exists
        if (!fs.existsSync(this.migrationsPath)) {
            fs.mkdirSync(this.migrationsPath, { recursive: true });
            logger.info('Migrations directory created');
        }

        // Get current batch number
        const lastMigration = await Migration.findOne().sort({ batch: -1 });
        this.currentBatch = lastMigration ? lastMigration.batch + 1 : 1;

        logger.info('Migration service initialized', { 
            migrationsPath: this.migrationsPath,
            currentBatch: this.currentBatch 
        });
    }

    /**
     * Create new migration file
     */
    async createMigration(name) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `${timestamp}_${name}.js`;
        const filepath = path.join(this.migrationsPath, filename);

        const template = `
/**
 * Migration: ${name}
 * Created: ${new Date().toISOString()}
 */
import mongoose from "mongoose";

export async function up() {
    // Write your migration logic here
    console.log('Running migration: ${name}');
    
    // Example: Create new collection
    // await mongoose.connection.db.createCollection('new_collection');
    
    // Example: Add index
    // await mongoose.connection.db.collection('users').createIndex({ email: 1 }, { unique: true });
    
    // Example: Update documents
    // await mongoose.connection.db.collection('users').updateMany({}, { $set: { newField: 'defaultValue' } });
}

export async function down() {
    // Write your rollback logic here
    console.log('Rolling back migration: ${name}');
    
    // Example: Drop collection
    // await mongoose.connection.db.dropCollection('new_collection');
    
    // Example: Remove index
    // await mongoose.connection.db.collection('users').dropIndex({ email: 1 });
    
    // Example: Remove field
    // await mongoose.connection.db.collection('users').updateMany({}, { $unset: { newField: 1 } });
}
`.trim();

        fs.writeFileSync(filepath, template);
        
        logger.info('Migration created', { 
            name, 
            filename, 
            filepath 
        });

        return { filename, filepath };
    }

    /**
     * Get all migration files
     */
    getMigrationFiles() {
        const files = fs.readdirSync(this.migrationsPath)
            .filter(file => file.endsWith('.js'))
            .sort();

        return files.map(file => ({
            filename: file,
            filepath: path.join(this.migrationsPath, file),
            name: file.replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}_/, '').replace('.js', '')
        }));
    }

    /**
     * Get pending migrations
     */
    async getPendingMigrations() {
        const allFiles = this.getMigrationFiles();
        const executed = await Migration.find().select('name');
        const executedNames = new Set(executed.map(m => m.name));

        return allFiles.filter(file => !executedNames.has(file.filename));
    }

    /**
     * Run pending migrations
     */
    async runMigrations() {
        const pending = await this.getPendingMigrations();
        
        if (pending.length === 0) {
            logger.info('No pending migrations');
            return { executed: 0, migrations: [] };
        }

        logger.info(`Running ${pending.length} pending migrations`);
        
        const results = [];

        for (const migration of pending) {
            try {
                logger.info(`Executing migration: ${migration.filename}`);
                
                // Dynamic import of migration file
                const migrationModule = await import(`file://${migration.filepath}`);
                
                if (typeof migrationModule.up !== 'function') {
                    throw new Error(`Migration ${migration.filename} missing 'up' function`);
                }

                // Execute migration
                await migrationModule.up();

                // Record migration
                await Migration.create({
                    name: migration.filename,
                    batch: this.currentBatch
                });

                results.push({
                    name: migration.filename,
                    status: 'success'
                });

                logger.info(`Migration executed successfully: ${migration.filename}`);

            } catch (error) {
                logger.error(`Migration failed: ${migration.filename}`, { 
                    error: error.message 
                });
                
                results.push({
                    name: migration.filename,
                    status: 'failed',
                    error: error.message
                });

                // Stop on first failure
                break;
            }
        }

        return { 
            executed: results.filter(r => r.status === 'success').length,
            migrations: results 
        };
    }

    /**
     * Rollback last batch of migrations
     */
    async rollbackMigrations(steps = 1) {
        const lastBatches = await Migration.find()
            .sort({ batch: -1 })
            .limit(steps * 10) // Assume max 10 migrations per batch
            .distinct('batch');

        const batchesToRollback = lastBatches.slice(0, steps);
        
        if (batchesToRollback.length === 0) {
            logger.info('No migrations to rollback');
            return { rolledBack: 0, migrations: [] };
        }

        const migrationsToRollback = await Migration.find({ 
            batch: { $in: batchesToRollback } 
        }).sort({ executedAt: -1 });

        logger.info(`Rolling back ${migrationsToRollback.length} migrations from ${batchesToRollback.length} batches`);

        const results = [];

        for (const migration of migrationsToRollback) {
            try {
                const filepath = path.join(this.migrationsPath, migration.name);
                
                if (!fs.existsSync(filepath)) {
                    throw new Error(`Migration file not found: ${migration.name}`);
                }

                logger.info(`Rolling back migration: ${migration.name}`);

                // Dynamic import
                const migrationModule = await import(`file://${filepath}`);
                
                if (typeof migrationModule.down !== 'function') {
                    throw new Error(`Migration ${migration.name} missing 'down' function`);
                }

                // Execute rollback
                await migrationModule.down();

                // Remove migration record
                await Migration.deleteOne({ _id: migration._id });

                results.push({
                    name: migration.name,
                    status: 'success'
                });

                logger.info(`Migration rolled back successfully: ${migration.name}`);

            } catch (error) {
                logger.error(`Migration rollback failed: ${migration.name}`, { 
                    error: error.message 
                });
                
                results.push({
                    name: migration.name,
                    status: 'failed',
                    error: error.message
                });

                // Stop on first failure
                break;
            }
        }

        return { 
            rolledBack: results.filter(r => r.status === 'success').length,
            migrations: results 
        };
    }

    /**
     * Get migration status
     */
    async getStatus() {
        const allFiles = this.getMigrationFiles();
        const executed = await Migration.find().sort({ executedAt: -1 });
        const pending = await this.getPendingMigrations();

        return {
            total: allFiles.length,
            executed: executed.length,
            pending: pending.length,
            lastBatch: this.currentBatch - 1,
            migrations: {
                executed: executed.map(m => ({
                    name: m.name,
                    batch: m.batch,
                    executedAt: m.executedAt
                })),
                pending: pending.map(m => ({
                    name: m.filename,
                    filepath: m.filepath
                }))
            }
        };
    }
}

export const migrationService = new MigrationService();
export default migrationService;
