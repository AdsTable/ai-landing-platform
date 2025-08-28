import { logger } from './logger.js';
import User from '../models/User.js';
import Plan from '../models/Plan.js';

/**
 * Mediator service to handle usage validation without circular dependencies
 * Breaks circular dependency between ai.js ↔ billing.js
 */
class UsageValidator {
    constructor() {
        this.logger = logger;
    }

    /**
     * Validate if user can perform AI operation based on their plan limits
     * @param {Object} user - User document with populated plan
     * @param {String} operationType - Type of operation (generation, translation, etc.)
     * @param {Object} operationParams - Parameters for cost calculation
     * @returns {Object} Validation result with permission and remaining quota
     */
    async validateUsage(user, operationType, operationParams = {}) {
        try {
            // Reset usage counters if needed (monthly reset)
            const wasReset = user.resetUsageIfNeeded();
            if (wasReset) {
                await user.save();
                this.logger.info('Usage counters reset for user', { userId: user._id });
            }

            // Get user's plan limits
            const plan = await Plan.findById(user.planId);
            if (!plan) {
                return {
                    allowed: false,
                    reason: 'No valid plan found',
                    remaining: 0
                };
            }

            // Calculate operation cost and check limits
            const validation = await this.checkOperationLimits(user, plan, operationType, operationParams);
            
            this.logger.info('Usage validation completed', {
                userId: user._id,
                operationType,
                allowed: validation.allowed,
                remaining: validation.remaining
            });

            return validation;

        } catch (error) {
            this.logger.error('Usage validation failed', {
                userId: user._id,
                operationType,
                error: error.message
            });
            
            return {
                allowed: false,
                reason: 'Validation error occurred',
                remaining: 0
            };
        }
    }

    /**
     * Check specific operation against plan limits
     */
    async checkOperationLimits(user, plan, operationType, params) {
        const limits = plan.limits;
        
        switch (operationType) {
            case 'page_generation':
                return this.validatePageGeneration(user, limits, params);
                
            case 'ai_translation':
                return this.validateTranslation(user, limits, params);
                
            case 'image_generation':
                return this.validateImageGeneration(user, limits, params);
                
            case 'mass_generation':
                return this.validateMassGeneration(user, limits, params);
                
            default:
                return {
                    allowed: false,
                    reason: `Unknown operation type: ${operationType}`,
                    remaining: 0
                };
        }
    }

    /**
     * Validate page generation limits
     */
    validatePageGeneration(user, limits, params) {
        const remaining = limits.pagesPerMonth - user.generatedThisMonth;
        
        if (remaining <= 0) {
            return {
                allowed: false,
                reason: 'Monthly page generation limit exceeded',
                remaining: 0,
                upgradeRequired: true
            };
        }

        // Check if industry is allowed for this plan
        if (limits.industries && !limits.industries.includes(params.industry)) {
            return {
                allowed: false,
                reason: `Industry ${params.industry} not allowed in current plan`,
                remaining,
                upgradeRequired: true
            };
        }

        // Check if language is allowed
        if (limits.languages && !limits.languages.includes(params.language)) {
            return {
                allowed: false,
                reason: `Language ${params.language} not allowed in current plan`,
                remaining,
                upgradeRequired: true
            };
        }

        return {
            allowed: true,
            remaining,
            costUnits: 1
        };
    }

    /**
     * Validate translation limits
     */
    validateTranslation(user, limits, params) {
        const translationLimit = limits.translationsPerMonth || limits.pagesPerMonth * 5;
        const remaining = translationLimit - user.translationsThisMonth;
        
        if (remaining <= 0) {
            return {
                allowed: false,
                reason: 'Monthly translation limit exceeded',
                remaining: 0,
                upgradeRequired: true
            };
        }

        // Calculate cost based on text length
        const textLength = params.text?.length || 0;
        const costUnits = Math.ceil(textLength / 1000); // 1 unit per 1000 characters

        if (remaining < costUnits) {
            return {
                allowed: false,
                reason: 'Insufficient translation quota for this text length',
                remaining,
                upgradeRequired: true
            };
        }

        return {
            allowed: true,
            remaining,
            costUnits
        };
    }

    /**
     * Validate image generation limits
     */
    validateImageGeneration(user, limits, params) {
        const imageLimit = limits.imagesPerMonth || Math.floor(limits.pagesPerMonth * 0.5);
        const remaining = imageLimit - (user.imagesGeneratedThisMonth || 0);
        
        return {
            allowed: remaining > 0,
            remaining,
            reason: remaining <= 0 ? 'Monthly image generation limit exceeded' : null,
            costUnits: 1
        };
    }

    /**
     * Validate mass generation limits (Enterprise feature)
     */
    validateMassGeneration(user, limits, params) {
        // Mass generation typically requires Enterprise plan
        if (limits.planLevel !== 'enterprise') {
            return {
                allowed: false,
                reason: 'Mass generation requires Enterprise plan',
                remaining: 0,
                upgradeRequired: true
            };
        }

        const estimatedPages = params.cityCount * params.typeCount || 50;
        const remaining = limits.pagesPerMonth - user.generatedThisMonth;

        if (remaining < estimatedPages) {
            return {
                allowed: false,
                reason: `Insufficient quota for mass generation (${estimatedPages} pages required, ${remaining} remaining)`,
                remaining,
                upgradeRequired: true
            };
        }

        return {
            allowed: true,
            remaining,
            costUnits: estimatedPages
        };
    }

    /**
     * Record usage after successful operation
     */
    async recordUsage(userId, operationType, costUnits = 1) {
        try {
            const user = await User.findById(userId);
            if (!user) return false;

            switch (operationType) {
                case 'page_generation':
                    user.generatedThisMonth += costUnits;
                    break;
                case 'ai_translation':
                    user.translationsThisMonth += costUnits;
                    break;
                case 'image_generation':
                    user.imagesGeneratedThisMonth = (user.imagesGeneratedThisMonth || 0) + costUnits;
                    break;
                case 'mass_generation':
                    user.generatedThisMonth += costUnits;
                    break;
            }

            await user.save();

            this.logger.info('Usage recorded', {
                userId,
                operationType,
                costUnits,
                newTotal: user.generatedThisMonth
            });

            return true;

        } catch (error) {
            this.logger.error('Failed to record usage', {
                userId,
                operationType,
                error: error.message
            });
            return false;
        }
    }
}

// Export singleton instance
export const usageValidator = new UsageValidator();
export default usageValidator;