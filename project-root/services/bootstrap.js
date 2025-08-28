import { serviceRegistry } from './serviceRegistry.js';
import aiService from './ai.js';
import billingService from './billing.js';
import { usageValidator } from './usageValidator.js';

/**
 * Bootstrap all AI platform services
 */
export async function bootstrapServices() {
    // Register core services with metadata
    serviceRegistry.register('logger', await import('./logger.js'), {
        version: '1.0.0',
        description: 'Centralized logging service',
        tags: ['core', 'logging'],
        singleton: true,
        lazy: false,
        priority: 100,
        healthCheck: async () => ({ status: 'healthy', uptime: process.uptime() })
    });

    serviceRegistry.register('usageValidator', usageValidator, {
        version: '1.0.0', 
        description: 'Usage validation and tracking service',
        dependencies: ['logger'],
        tags: ['core', 'validation'],
        healthCheck: async () => ({ 
            status: 'healthy', 
            validationsToday: await usageValidator.getStats() 
        })
    });

    serviceRegistry.register('ai', aiService, {
        version: '2.0.0',
        description: 'OpenAI integration service',
        dependencies: ['logger', 'usageValidator'],
        tags: ['ai', 'external-api'],
        timeout: 120000, // 2 minutes for AI service
        healthCheck: async () => {
            const isValid = await aiService.validateApiKey();
            return { 
                status: isValid ? 'healthy' : 'unhealthy',
                apiConnection: isValid 
            };
        }
    });

    serviceRegistry.register('billing', billingService, {
        version: '1.0.0',
        description: 'Billing and subscription management',
        dependencies: ['logger'],
        tags: ['billing', 'stripe'],
        healthCheck: async () => ({ status: 'healthy' })
    });

    // Initialize all services
    await serviceRegistry.initialize('ai');
    
    console.log('🚀 All services initialized successfully');
    console.log(serviceRegistry.getStatus());
}