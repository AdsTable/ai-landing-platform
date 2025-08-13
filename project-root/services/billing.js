import Stripe from "stripe";
import { logger } from "./logger.js";
import { serviceRegistry } from "./registry.js";
import User from "../models/User.js";
import Plan from "../models/Plan.js";
import Invoice from "../models/Invoice.js";
import Subscription from "../models/Subscription.js";
import { sendEmail } from "./email.js";

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Billing Service Class - Main billing operations
 */
export class BillingService {
    constructor() {
        this.stripe = stripe;
        this.initialized = false;
    }

    async initialize() {
        if (!process.env.STRIPE_SECRET_KEY) {
            throw new Error('Stripe secret key not configured');
        }

        try {
            // Test Stripe connection
            await this.stripe.balance.retrieve();
            this.initialized = true;
            logger.info('Billing Service initialized successfully');
        } catch (error) {
            logger.error('Billing Service initialization failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Create Stripe customer
     */
    static async createCustomer(user) {
        try {
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.username,
                metadata: {
                    userId: user._id.toString(),
                    userRole: user.role
                }
            });

            // Update user with Stripe customer ID
            await User.findByIdAndUpdate(user._id, {
                stripeCustomerId: customer.id
            });

            logger.info('Stripe customer created', {
                userId: user._id,
                customerId: customer.id,
                email: user.email
            });

            return customer;

        } catch (error) {
            logger.error('Failed to create Stripe customer', {
                userId: user._id,
                error: error.message
            });
            throw new Error(`Customer creation failed: ${error.message}`);
        }
    }

    /**
     * Create subscription with payment method
     */
    static async createSubscription(user, planId, paymentMethodId) {
        try {
            const plan = await Plan.findById(planId);
            if (!plan || !plan.stripePriceId) {
                throw new Error('Invalid plan or missing Stripe price ID');
            }

            // Ensure user has Stripe customer
            let customerId = user.stripeCustomerId;
            if (!customerId) {
                const customer = await this.createCustomer(user);
                customerId = customer.id;
            }

            // Attach payment method to customer
            await stripe.paymentMethods.attach(paymentMethodId, {
                customer: customerId,
            });

            // Set as default payment method
            await stripe.customers.update(customerId, {
                invoice_settings: {
                    default_payment_method: paymentMethodId,
                },
            });

            // Create subscription
            const subscription = await stripe.subscriptions.create({
                customer: customerId,
                items: [{ price: plan.stripePriceId }],
                default_payment_method: paymentMethodId,
                metadata: {
                    userId: user._id.toString(),
                    planId: plan._id.toString()
                },
                expand: ['latest_invoice.payment_intent']
            });

            // Save subscription to database
            const dbSubscription = await Subscription.create({
                userId: user._id,
                stripeSubscriptionId: subscription.id,
                planId: plan._id,
                status: subscription.status,
                currentPeriodStart: new Date(subscription.current_period_start * 1000),
                currentPeriodEnd: new Date(subscription.current_period_end * 1000),
                trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
                trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null
            });

            // Update user
            await User.findByIdAndUpdate(user._id, {
                planId: plan._id,
                stripeSubscriptionId: subscription.id,
                subscriptionStatus: subscription.status
            });

            // Send welcome email
            try {
                await sendEmail(user.email, 'subscription_created', {
                    username: user.username,
                    planName: plan.name,
                    amount: plan.price
                });
            } catch (emailError) {
                logger.warn('Failed to send subscription confirmation email', {
                    userId: user._id,
                    error: emailError.message
                });
            }

            logger.info('Subscription created successfully', {
                userId: user._id,
                subscriptionId: subscription.id,
                planId: plan._id,
                status: subscription.status
            });

            return {
                subscription,
                dbSubscription,
                plan
            };

        } catch (error) {
            logger.error('Subscription creation failed', {
                userId: user._id,
                planId,
                error: error.message
            });
            throw new Error(`Subscription creation failed: ${error.message}`);
        }
    }

    /**
     * Cancel subscription
     */
    static async cancelSubscription(user, immediately = false) {
        try {
            if (!user.stripeSubscriptionId) {
                throw new Error('No active subscription found');
            }

            let subscription;

            if (immediately) {
                // Cancel immediately
                subscription = await stripe.subscriptions.del(user.stripeSubscriptionId);
            } else {
                // Cancel at period end
                subscription = await stripe.subscriptions.update(
                    user.stripeSubscriptionId,
                    { cancel_at_period_end: true }
                );
            }

            // Update database subscription
            await Subscription.findOneAndUpdate(
                { stripeSubscriptionId: user.stripeSubscriptionId },
                { 
                    status: immediately ? 'canceled' : subscription.status,
                    cancelAtPeriodEnd: !immediately ? true : false,
                    canceledAt: immediately ? new Date() : null
                }
            );

            // Update user
            const newStatus = immediately ? 'canceled' : subscription.status;
            await User.findByIdAndUpdate(user._id, {
                subscriptionStatus: newStatus,
                ...(immediately && { planId: null }) // Move to free plan if immediate cancellation
            });

            // Send cancellation email
            try {
                await sendEmail(user.email, 'subscription_canceled', {
                    username: user.username,
                    immediately: immediately
                });
            } catch (emailError) {
                logger.warn('Failed to send cancellation email', {
                    userId: user._id,
                    error: emailError.message
                });
            }

            logger.info('Subscription canceled', {
                userId: user._id,
                subscriptionId: subscription.id,
                immediately,
                status: newStatus
            });

            return subscription;

        } catch (error) {
            logger.error('Subscription cancellation failed', {
                userId: user._id,
                error: error.message
            });
            throw new Error(`Cancellation failed: ${error.message}`);
        }
    }

    /**
     * Check if user can generate content (usage limits)
     */
    static async checkGenerationLimit(userId) {
        try {
            const user = await User.findById(userId).populate('planId');
            if (!user) {
                return false;
            }

            if (!user.planId) {
                // No plan assigned - check if there's a default free plan
                const freePlan = await Plan.findOne({ price: 0 });
                if (freePlan) {
                    await User.findByIdAndUpdate(userId, { planId: freePlan._id });
                    user.planId = freePlan;
                } else {
                    return false;
                }
            }

            // Reset usage if new month
            if (user.resetUsageIfNeeded()) {
                await user.save();
            }

            const plan = user.planId;
            const currentUsage = user.generatedThisMonth || 0;

            // Unlimited plan (-1)
            if (plan.limits.monthlyGenerations === -1) {
                return true;
            }

            // Check limit
            const hasLimit = currentUsage < plan.limits.monthlyGenerations;

            logger.debug('Generation limit check', {
                userId,
                currentUsage,
                limit: plan.limits.monthlyGenerations,
                hasLimit,
                planName: plan.name
            });

            return hasLimit;

        } catch (error) {
            logger.error('Generation limit check failed', { 
                userId, 
                error: error.message 
            });
            return false;
        }
    }

    /**
     * Track usage (increment counters)
     */
    static async trackUsage(userId, type, amount = 1) {
        try {
            const updateField = {
                'generation': 'generatedThisMonth',
                'api_call': 'apiCallsThisMonth', 
                'translation': 'translationsThisMonth'
            }[type];

            if (!updateField) {
                logger.warn('Invalid usage type for tracking', { userId, type });
                return false;
            }

            const result = await User.findByIdAndUpdate(
                userId,
                { $inc: { [updateField]: amount } },
                { new: true }
            );

            if (result) {
                logger.info('Usage tracked successfully', { 
                    userId, 
                    type, 
                    amount,
                    newValue: result[updateField]
                });
                return true;
            }

            return false;

        } catch (error) {
            logger.error('Usage tracking failed', { 
                userId, 
                type, 
                amount, 
                error: error.message 
            });
            return false;
        }
    }

    /**
     * Get user's usage statistics
     */
    static async getUsageStats(userId) {
        try {
            const user = await User.findById(userId).populate('planId');
            if (!user) {
                return null;
            }

            const plan = user.planId;
            if (!plan) {
                return null;
            }

            return {
                currentPeriod: {
                    generated: user.generatedThisMonth || 0,
                    apiCalls: user.apiCallsThisMonth || 0,
                    translations: user.translationsThisMonth || 0
                },
                limits: {
                    generated: plan.limits.monthlyGenerations,
                    apiCalls: plan.limits.monthlyApiCalls,
                    translations: plan.limits.monthlyTranslations
                },
                percentages: {
                    generated: plan.limits.monthlyGenerations > 0 
                        ? ((user.generatedThisMonth || 0) / plan.limits.monthlyGenerations * 100)
                        : 0,
                    apiCalls: plan.limits.monthlyApiCalls > 0
                        ? ((user.apiCallsThisMonth || 0) / plan.limits.monthlyApiCalls * 100)
                        : 0,
                    translations: plan.limits.monthlyTranslations > 0
                        ? ((user.translationsThisMonth || 0) / plan.limits.monthlyTranslations * 100)
                        : 0
                },
                plan: {
                    name: plan.name,
                    price: plan.price
                }
            };

        } catch (error) {
            logger.error('Failed to get usage stats', {
                userId,
                error: error.message
            });
            return null;
        }
    }

    /**
     * Sync invoice from Stripe webhook
     */
    static async syncInvoice(stripeInvoice) {
        try {
            const subscription = await stripe.subscriptions.retrieve(stripeInvoice.subscription);
            const userId = subscription.metadata.userId;

            if (!userId) {
                logger.warn('Invoice sync skipped - no userId in metadata', {
                    invoiceId: stripeInvoice.id
                });
                return false;
            }

            const invoice = await Invoice.findOneAndUpdate(
                { stripeInvoiceId: stripeInvoice.id },
                {
                    userId: userId,
                    stripeInvoiceId: stripeInvoice.id,
                    amount: stripeInvoice.amount_paid || stripeInvoice.amount_due,
                    currency: stripeInvoice.currency,
                    status: stripeInvoice.status,
                    planId: subscription.metadata.planId,
                    periodStart: new Date(stripeInvoice.period_start * 1000),
                    periodEnd: new Date(stripeInvoice.period_end * 1000),
                    hostedInvoiceUrl: stripeInvoice.hosted_invoice_url,
                    invoicePdf: stripeInvoice.invoice_pdf,
                    metadata: stripeInvoice.metadata
                },
                { upsert: true, new: true }
            );

            logger.info('Invoice synced successfully', {
                userId,
                invoiceId: stripeInvoice.id,
                status: stripeInvoice.status,
                amount: stripeInvoice.amount_paid || stripeInvoice.amount_due
            });

            return invoice;

        } catch (error) {
            logger.error('Invoice sync failed', {
                invoiceId: stripeInvoice.id,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Calculate overage charges
     */
    static async calculateOverageCharges(userId) {
        try {
            const user = await User.findById(userId).populate('planId');
            if (!user || !user.planId) {
                return { total: 0, details: [] };
            }

            const plan = user.planId;
            const overages = [];
            let total = 0;

            // Pages overage
            if (plan.limits.monthlyGenerations > 0 && user.generatedThisMonth > plan.limits.monthlyGenerations) {
                const overage = user.generatedThisMonth - plan.limits.monthlyGenerations;
                const rate = plan.overageRates?.pages || 1.0;
                const cost = overage * rate;
                
                overages.push({
                    type: 'pages',
                    overage,
                    rate,
                    cost
                });
                total += cost;
            }

            // API calls overage
            if (plan.limits.monthlyApiCalls > 0 && user.apiCallsThisMonth > plan.limits.monthlyApiCalls) {
                const overage = user.apiCallsThisMonth - plan.limits.monthlyApiCalls;
                const rate = plan.overageRates?.apiCalls || 0.01;
                const cost = Math.ceil(overage / 100) * rate;
                
                overages.push({
                    type: 'apiCalls',
                    overage,
                    rate,
                    cost
                });
                total += cost;
            }

            // Translations overage
            if (plan.limits.monthlyTranslations > 0 && user.translationsThisMonth > plan.limits.monthlyTranslations) {
                const overage = user.translationsThisMonth - plan.limits.monthlyTranslations;
                const rate = plan.overageRates?.translations || 0.05;
                const cost = overage * rate;
                
                overages.push({
                    type: 'translations',
                    overage,
                    rate,
                    cost
                });
                total += cost;
            }

            logger.info('Overage calculated', {
                userId,
                total,
                overageCount: overages.length
            });

            return { total: Math.round(total * 100) / 100, details: overages };

        } catch (error) {
            logger.error('Overage calculation failed', {
                userId,
                error: error.message
            });
            return { total: 0, details: [] };
        }
    }

    async shutdown() {
        this.initialized = false;
        logger.info('Billing Service shutdown');
    }
}

// =============================================================================
// STANDALONE EXPORTED FUNCTIONS FOR ROUTES
// =============================================================================

/**
 * Create Stripe Checkout Session
 */
export async function createCheckoutSession(userId, planId, successUrl, cancelUrl) {
    try {
        const user = await User.findById(userId);
        const plan = await Plan.findById(planId);
        
        if (!user || !plan) {
            throw new Error('User or plan not found');
        }

        // Ensure user has Stripe customer
        let customerId = user.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.username,
                metadata: { userId: user._id.toString() }
            });
            
            customerId = customer.id;
            await User.findByIdAndUpdate(userId, { stripeCustomerId: customerId });
        }

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [{
                price: plan.stripePriceId,
                quantity: 1,
            }],
            mode: plan.price > 0 ? 'subscription' : 'setup',
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: {
                userId: user._id.toString(),
                planId: plan._id.toString()
            },
            allow_promotion_codes: true
        });

        logger.info('Checkout session created', {
            userId,
            planId,
            sessionId: session.id
        });

        return session;

    } catch (error) {
        logger.error('Checkout session creation failed', {
            userId,
            planId,
            error: error.message
        });
        throw error;
    }
}

/**
 * Create customer portal session
 */
export async function createPortalSession(userId, returnUrl) {
    try {
        const user = await User.findById(userId);
        if (!user || !user.stripeCustomerId) {
            throw new Error('User not found or no Stripe customer');
        }

        const session = await stripe.billingPortal.sessions.create({
            customer: user.stripeCustomerId,
            return_url: returnUrl,
        });

        logger.info('Portal session created', {
            userId,
            sessionId: session.id
        });

        return session;

    } catch (error) {
        logger.error('Portal session creation failed', {
            userId,
            error: error.message
        });
        throw error;
    }
}

/**
 * Get subscription details
 */
export async function getSubscriptionDetails(userId) {
    try {
        const user = await User.findById(userId).populate('planId');
        if (!user) {
            return null;
        }

        if (!user.stripeSubscriptionId) {
            return {
                user,
                plan: user.planId,
                status: 'no_subscription',
                subscription: null,
                upcomingInvoice: null
            };
        }

        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        
        let upcomingInvoice = null;
        try {
            upcomingInvoice = await stripe.invoices.retrieveUpcoming({
                customer: user.stripeCustomerId
            });
        } catch (error) {
            // No upcoming invoice is fine
            logger.debug('No upcoming invoice found', { userId });
        }

        return {
            user,
            subscription,
            upcomingInvoice,
            plan: user.planId,
            status: user.subscriptionStatus
        };

    } catch (error) {
        logger.error('Failed to get subscription details', {
            userId,
            error: error.message
        });
        return null;
    }
}

/**
 * Update payment method
 */
export async function updatePaymentMethod(userId, paymentMethodId) {
    try {
        const user = await User.findById(userId);
        if (!user || !user.stripeCustomerId) {
            throw new Error('User not found or no Stripe customer');
        }

        // Attach payment method to customer
        await stripe.paymentMethods.attach(paymentMethodId, {
            customer: user.stripeCustomerId,
        });

        // Set as default payment method
        await stripe.customers.update(user.stripeCustomerId, {
            invoice_settings: {
                default_payment_method: paymentMethodId,
            },
        });

        // Update subscription if exists
        if (user.stripeSubscriptionId) {
            await stripe.subscriptions.update(user.stripeSubscriptionId, {
                default_payment_method: paymentMethodId,
            });
        }

        logger.info('Payment method updated', {
            userId,
            paymentMethodId
        });

        return true;

    } catch (error) {
        logger.error('Payment method update failed', {
            userId,
            error: error.message
        });
        throw error;
    }
}

/**
 * Get user invoices
 */
export async function getUserInvoices(userId, limit = 10, page = 1) {
    try {
        const skip = (page - 1) * limit;
        
        const invoices = await Invoice.find({ userId })
            .populate('planId')
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip);

        const total = await Invoice.countDocuments({ userId });

        return {
            invoices,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        };

    } catch (error) {
        logger.error('Failed to get user invoices', {
            userId,
            error: error.message
        });
        return { invoices: [], pagination: { page: 1, limit, total: 0, pages: 0 } };
    }
}

// =============================================================================
// BACKWARD COMPATIBILITY EXPORTS
// =============================================================================
export const createCustomer = BillingService.createCustomer;
export const createSubscription = BillingService.createSubscription;
export const cancelSubscription = BillingService.cancelSubscription;
export const checkGenerationLimit = BillingService.checkGenerationLimit;
export const trackUsage = BillingService.trackUsage;
export const getUsageStats = BillingService.getUsageStats;
export const syncInvoice = BillingService.syncInvoice;
export const calculateOverageCharges = BillingService.calculateOverageCharges;

// Default export
export default BillingService;
