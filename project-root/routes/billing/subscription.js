import express from "express";
import Stripe from "stripe";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { body } from "express-validator";
import { handleValidationErrors } from "../../middleware/validation.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { logger } from "../../services/logger.js";
import User from "../../models/User.js";
import Plan from "../../models/Plan.js";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const validateSubscription = [
    body('planId').isMongoId().withMessage('Valid plan ID required'),
    body('paymentMethodId').isString().withMessage('Payment method required'),
    handleValidationErrors
];

/**
 * GET /billing/plans - Show available plans
 */
router.get("/plans", requireAuth, asyncHandler(async (req, res) => {
    const plans = await Plan.find({ active: true }).sort({ price: 1 });
    
    res.render("billing/plans", {
        title: "Choose Your Plan",
        siteName: process.env.SITE_NAME,
        user: req.user,
        plans,
        currentPlan: req.user.planId,
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY
    });
}));

/**
 * GET /billing/checkout/:planId - Checkout page
 */
router.get("/checkout/:planId", requireAuth, asyncHandler(async (req, res) => {
    const plan = await Plan.findById(req.params.planId);
    
    if (!plan) {
        return res.status(404).send('Plan not found');
    }

    // Create Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
        amount: plan.price * 100, // Convert to cents
        currency: 'usd',
        customer: req.user.stripeCustomerId,
        metadata: {
            userId: req.user._id.toString(),
            planId: plan._id.toString()
        }
    });

    res.render("billing/checkout", {
        title: "Checkout",
        siteName: process.env.SITE_NAME,
        user: req.user,
        plan,
        clientSecret: paymentIntent.client_secret,
        stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
        VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY
    });
}));

/**
 * POST /billing/subscribe - Create subscription
 */
router.post("/subscribe", 
    requireAuth,
    validateSubscription,
    asyncHandler(async (req, res) => {
        const { planId, paymentMethodId } = req.body;
        
        const plan = await Plan.findById(planId);
        if (!plan) {
            return res.status(404).json({ success: false, error: "Plan not found" });
        }

        try {
            // Create or get Stripe customer
            let customerId = req.user.stripeCustomerId;
            if (!customerId) {
                const customer = await stripe.customers.create({
                    email: req.user.email,
                    name: req.user.username,
                    metadata: {
                        userId: req.user._id.toString()
                    }
                });
                customerId = customer.id;
                
                // Save customer ID to user
                await User.findByIdAndUpdate(req.user._id, {
                    stripeCustomerId: customerId
                });
            }

            // Attach payment method to customer
            await stripe.paymentMethods.attach(paymentMethodId, {
                customer: customerId,
            });

            // Create subscription
            const subscription = await stripe.subscriptions.create({
                customer: customerId,
                items: [{ price: plan.stripePriceId }],
                default_payment_method: paymentMethodId,
                metadata: {
                    userId: req.user._id.toString(),
                    planId: plan._id.toString()
                }
            });

            // Update user plan
            await User.findByIdAndUpdate(req.user._id, {
                planId: plan._id,
                stripeSubscriptionId: subscription.id,
                subscriptionStatus: subscription.status
            });

            logger.info('Subscription created', {
                userId: req.user._id,
                planId: plan._id,
                subscriptionId: subscription.id
            });

            res.json({
                success: true,
                subscriptionId: subscription.id,
                status: subscription.status
            });

        } catch (error) {
            logger.error('Subscription creation failed', {
                userId: req.user._id,
                planId,
                error: error.message
            });

            res.status(500).json({
                success: false,
                error: "Subscription creation failed"
            });
        }
    })
);

/**
 * POST /billing/cancel - Cancel subscription
 */
router.post("/cancel", requireAuth, asyncHandler(async (req, res) => {
    if (!req.user.stripeSubscriptionId) {
        return res.status(400).json({
            success: false,
            error: "No active subscription found"
        });
    }

    try {
        const subscription = await stripe.subscriptions.update(
            req.user.stripeSubscriptionId,
            { cancel_at_period_end: true }
        );

        await User.findByIdAndUpdate(req.user._id, {
            subscriptionStatus: 'canceled'
        });

        logger.info('Subscription canceled', {
            userId: req.user._id,
            subscriptionId: subscription.id
        });

        res.json({
            success: true,
            message: "Subscription will be canceled at the end of the billing period"
        });

    } catch (error) {
        logger.error('Subscription cancellation failed', {
            userId: req.user._id,
            error: error.message
        });

        res.status(500).json({
            success: false,
            error: "Cancellation failed"
        });
    }
}));

export default router;
