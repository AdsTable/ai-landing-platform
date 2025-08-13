import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    stripeSubscriptionId: { type: String, required: true, unique: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
    status: {
        type: String,
        enum: ['trialing', 'active', 'incomplete', 'incomplete_expired', 'past_due', 'canceled', 'unpaid'],
        required: true
    },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    canceledAt: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    trialStart: { type: Date },
    trialEnd: { type: Date }
}, {
    timestamps: true
});

subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 });

export default mongoose.model('Subscription', subscriptionSchema);
