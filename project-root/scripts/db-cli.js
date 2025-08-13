#!/usr/bin/env node
import { program } from "commander";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { migrationService } from "../services/database/migrations.js";
import { seedService } from "../services/database/seed.js";
import { backupService } from "../services/database/backup.js";
import { dbHealthService } from "../services/database/health.js";

dotenv.config();

// Connect to database
async function connectDB() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to database');
}

// Migration commands
program
    .command('migration:create <name>')
    .description('Create new migration file')
    .action(async (name) => {
        await migrationService.initialize();
        const result = await migrationService.createMigration(name);
        console.log(`Migration created: ${result.filename}`);
        process.exit(0);
    });

program
    .command('migration:run')
    .description('Run pending migrations')
    .action(async () => {
        await connectDB();
        await migrationService.initialize();
        const result = await migrationService.runMigrations();
        console.log(`Executed ${result.executed} migrations`);
        await mongoose.disconnect();
        process.exit(0);
    });

program
    .command('migration:rollback')
    .option('-s, --steps <number>', 'Number of batches to rollback', '1')
    .description('Rollback migrations')
    .action(async (options) => {
        await connectDB();
        await migrationService.initialize();
        const result = await migrationService.rollbackMigrations(parseInt(options.steps));
        console.log(`Rolled back ${result.rolledBack} migrations`);
        await mongoose.disconnect();
        process.exit(0);
    });

// Seed commands
program
    .command('seed:run')
    .option('-f, --force', 'Force seed even if data exists')
    .description('Seed database with initial data')
    .action(async (options) => {
        await connectDB();
        const result = await seedService.seedDatabase(options.force);
        if (result.seeded) {
            console.log('Database seeded successfully');
        } else {
            console.log('Database already seeded');
        }
        await mongoose.disconnect();
        process.exit(0);
    });

// Backup commands
program
    .command('backup:create')
    .option('-d, --description <desc>', 'Backup description')
    .description('Create database backup')
    .action(async (options) => {
        await backupService.initialize();
        const backup = await backupService.createBackup(options.description || '');
        console.log(`Backup created: ${backup.filename} (${backup.size})`);
        process.exit(0);
    });

program
    .command('backup:restore <filename>')
    .description('Restore database from backup')
    .action(async (filename) => {
        await backupService.initialize();
        await backupService.restoreBackup(filename);
        console.log('Database restored successfully');
        process.exit(0);
    });

// Health commands
program
    .command('health:check')
    .description('Run database health checks')
    .action(async () => {
        await connectDB();
        await dbHealthService.initialize();
        const health = await dbHealthService.runHealthChecks();
        console.log(`Database status: ${health.overall.status}`);
        console.log(`Checks passed: ${health.summary.passed}/${health.summary.total}`);
        await mongoose.disconnect();
        process.exit(0);
    });

program.parse();
