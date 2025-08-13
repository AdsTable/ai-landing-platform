import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, select: false, minlength: 8 },
    role: { type: String, enum: ['admin', 'editor', 'marketer', 'client'], default: 'client' },
    
    // Email verification
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String },
    emailVerificationExpires: { type: Date, default: () => new Date(Date.now() + 24*60*60*1000) },
    
    // Password reset  
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },
    
    // Plan and tenant relationships
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
    
    // Stripe integration
    stripeCustomerId: { type: String, unique: true, sparse: true },
    stripeSubscriptionId: { type: String, unique: true, sparse: true },
    subscriptionStatus: { 
        type: String, 
        enum: ['trialing', 'active', 'incomplete', 'incomplete_expired', 'past_due', 'canceled', 'unpaid'],
        default: 'trialing' 
    },
    
    // Usage tracking with reset logic
    generatedThisMonth: { type: Number, default: 0, min: 0 },
    apiCallsThisMonth: { type: Number, default: 0, min: 0 },
    translationsThisMonth: { type: Number, default: 0, min: 0 },
    lastUsageReset: { type: Date, default: Date.now },
    
    // Push notifications
    pushSubscription: {
        endpoint: String,
        keys: {
            p256dh: String,
            auth: String
        }
    },
    
    // Account status
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    loginAttempts: { type: Number, default: 0, max: 5 },
    lockUntil: { type: Date }
}, {
    timestamps: true
});

// INDEXES
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ emailVerificationToken: 1 });
userSchema.index({ passwordResetToken: 1 });
userSchema.index({ stripeCustomerId: 1 }, { sparse: true });
userSchema.index({ planId: 1 });
userSchema.index({ tenantId: 1 });
userSchema.index({ createdAt: -1 });

// Reset usage counters monthly
userSchema.methods.resetUsageIfNeeded = function() {
    const now = new Date();
    const lastReset = new Date(this.lastUsageReset);
    
    if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
        this.generatedThisMonth = 0;
        this.apiCallsThisMonth = 0;
        this.translationsThisMonth = 0;
        this.lastUsageReset = now;
        return true;
    }
    return false;
};

userSchema.methods.isAccountLocked = function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
};

// ✅ PRE-SAVE MIDDLEWARE for check
userSchema.pre('save', async function(next) {
    // Reset usage if needed
    this.resetUsageIfNeeded();
    
    // Update lastLoginAt if this is a login
    if (this.isModified('lastLoginAt')) {
        this.loginAttempts = 0;
        this.lockUntil = undefined;
    }
    
    next();
});

export default mongoose.model('User', userSchema);
