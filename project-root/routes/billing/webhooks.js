import express from "express";
import Stripe from "stripe";
import { logger } from "../../services/logger.js";
import { sendEmail } from "../../services/email.js";
import User from "../../models/User.js";

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * POST /billing/webhooks/stripe - Handle Stripe webhooks
 */
router.post('/stripe', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        logger.error('Webhook signature verification failed', { error: err.message });
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
        switch (event.type) {
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
                await handleSubscriptionUpdate(event.data.object);
                break;
                
            case 'customer.subscription.deleted':
                await handleSubscriptionCanceled(event.data.object);
                break;
                
            case 'invoice.payment_succeeded':
                await handlePaymentSucceeded(event.data.object);
                break;
                
            case 'invoice.payment_failed':
                await handlePaymentFailed(event.data.object);
                break;
                
            default:
                logger.info('Unhandled Stripe event', { type: event.type });
        }

        res.json({received: true});
        
    } catch (error) {
        logger.error('Webhook processing failed', {
            eventType: event.type,
            error: error.message
        });
        res.status(500).send('Webhook processing failed');
    }
});

async function handleSubscriptionUpdate(subscription) {
    const userId = subscription.metadata.userId;
    if (!userId) return;

    await User.findByIdAndUpdate(userId, {
        subscriptionStatus: subscription.status,
        stripeSubscriptionId: subscription.id
    });

    logger.info('Subscription updated', {
        userId,
        subscriptionId: subscription.id,
        status: subscription.status
    });
}

async function handleSubscriptionCanceled(subscription) {
    const userId = subscription.metadata.userId;
    if (!userId) return;

    const user = await User.findByIdAndUpdate(userId, {
        subscriptionStatus: 'canceled',
        planId: null // Move to free plan
    });

    // Send cancellation email
    if (user) {
        await sendEmail(user.email, 'subscription_canceled', {
            username: user.username
        });
    }

    logger.info('Subscription canceled', {
        userId,
        subscriptionId: subscription.id
    });
}

async function handlePaymentSucceeded(invoice) {
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    const userId = subscription.metadata.userId;
    
    if (!userId) return;

    const user = await User.findById(userId);
    if (user) {
        // Reset usage limits for new billing period
        await User.findByIdAndUpdate(userId, {
            generatedThisMonth: 0,
            apiCallsThisMonth: 0,
            translationsThisMonth: 0,
            lastUsageReset: new Date()
        });

        // Send payment confirmation email
        await sendEmail(user.email, 'payment_succeeded', {
            username: user.username,
            amount: invoice.amount_paid / 100,
            invoiceUrl: invoice.hosted_invoice_url
        });
    }

    logger.info('Payment succeeded', {
        userId,
        amount: invoice.amount_paid,
        invoiceId: invoice.id
    });
}

async function handlePaymentFailed(invoice) {
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    const userId = subscription.metadata.userId;
    
    if (!userId) return;

    const user = await User.findById(userId);
    if (user) {
        await sendEmail(user.email, 'payment_failed', {
            username: user.username,
            amount: invoice.amount_due / 100,
            invoiceUrl: invoice.hosted_invoice_url
        });
    }

    logger.error('Payment failed', {
        userId,
        amount: invoice.amount_due,
        invoiceId: invoice.id
    });
}

export default router;
