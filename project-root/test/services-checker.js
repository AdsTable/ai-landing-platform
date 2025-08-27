import dotenv from "dotenv";
import mongoose from "mongoose";
import { serviceRegistry } from "../services/registry.js";
import aiService from "../services/ai.js";
import { BillingService } from "../services/billing.js";
import { migrationService } from "../services/database/migrations.js";
import { seedService } from "../services/database/seed.js";
import { backupService } from "../services/database/backup.js";
import { dbHealthService } from "../services/database/health.js";
import { logger } from "../services/logger.js";

dotenv.config();

class ServicesTester {
    constructor() {
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            errors: []
        };
    }

    async testService(name, testFn) {
        this.results.total++;
        console.log(`Testing service: ${name}`);
        
        try {
            await testFn();
            this.results.passed++;
            console.log(`✅ ${name} - PASSED`);
            return true;
        } catch (error) {
            this.results.failed++;
            console.log(`❌ ${name} - FAILED: ${error.message}`);
            this.results.errors.push({ service: name, error: error.message });
            return false;
        }
    }

    async runAllTests() {
        console.log('🔧 SERVICES INTEGRATION TEST START');
        console.log('='.repeat(50));

        // Connect to test database
        try {
            await mongoose.connect(process.env.MONGO_URI);
            console.log('📊 Connected to test database');
        } catch (error) {
            console.error('Failed to connect to database:', error.message);
            process.exit(1);
        }

        // 1. SERVICE REGISTRY TESTS
        await this.testService('Service Registry', async () => {
            serviceRegistry.register('test-service', { test: true }, []);
            const status = serviceRegistry.getStatus();
            if (!status['test-service']) throw new Error('Service not registered');
        });

        // 2. AI SERVICE TESTS
        await this.testService('AI Service Initialization', async () => {
            if (!process.env.OPENAI_API_KEY) {
                throw new Error('OpenAI API key not configured');
            }
            // Don't actually call OpenAI in tests, just check config
        });

        // 3. BILLING SERVICE TESTS
        await this.testService('Billing Service', async () => {
            if (!process.env.STRIPE_SECRET_KEY) {
                throw new Error('Stripe secret key not configured');
            }
            // Test Billing service methods without actual Stripe calls
        });

        // 4. DATABASE SERVICES TESTS
        await this.testService('Migration Service', async () => {
            await migrationService.initialize();
            const status = await migrationService.getStatus();
            if (typeof status.total === 'undefined') throw new Error('Migration service not working');
        });

        await this.testService('Seed Service', async () => {
            const isSeeded = await seedService.isSeeded();
            // isSeeded should be boolean
            if (typeof isSeeded !== 'boolean') throw new Error('Seed service not working');
        });

        await this.testService('Backup Service', async () => {
            await backupService.initialize();
            const backups = await backupService.listBackups();
            if (!Array.isArray(backups)) throw new Error('Backup service not working');
        });

        await this.testService('Database Health Service', async () => {
            await dbHealthService.initialize();
            const status = dbHealthService.getCurrentStatus();
            if (!status.status) throw new Error('Health service not working');
        });

        // 5. LOGGER TEST
        await this.testService('Logger Service', async () => {
            logger.info('Test log message');
            // If no error thrown, logger is working
        });

        console.log('\n' + '='.repeat(50));
        console.log('📊 SERVICES TEST RESULTS:');
        console.log(`✅ Passed: ${this.results.passed}`);
        console.log(`❌ Failed: ${this.results.failed}`);
        console.log(`📈 Total: ${this.results.total}`);
        console.log(`🎯 Success Rate: ${((this.results.passed / this.results.total) * 100).toFixed(1)}%`);
        
        if (this.results.errors.length > 0) {
            console.log('\n💥 FAILED SERVICES:');
            this.results.errors.forEach(error => {
                console.log(`   ${error.service}: ${error.error}`);
            });
        }

        await mongoose.disconnect();
        return this.results;
    }
}

// Run tests
const tester = new ServicesTester();
tester.runAllTests()
    .then(results => {
        process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(error => {
        console.error('Service tests failed:', error);
        process.exit(1);
    });
