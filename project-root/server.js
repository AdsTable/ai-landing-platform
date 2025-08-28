import fs from 'fs';
import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import mongoose from "mongoose";
import path from "path";
import dotenv from "dotenv";

// Security imports
import { helmetConfig, corsConfig, generalLimiter, authLimiter, sanitizeInput } from "./middleware/security.js";
import { globalErrorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { requestLogger, healthMetrics } from "./middleware/monitoring.js";
import mongoSanitize from "express-mongo-sanitize";
import cors from "cors";

dotenv.config();

const app = express();
const requiredDirs = ['public/uploads', 'logs', 'migrations', 'docs'];
requiredDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
});


// Trust proxy (important for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware (FIRST!)
app.use(helmetConfig);
app.use(cors(corsConfig));
app.use(mongoSanitize()); // Prevent NoSQL injection
app.use(sanitizeInput); // XSS protection

// Rate limiting
app.use(generalLimiter);

// Request monitoring
app.use(requestLogger);
app.use((req, res, next) => {
    healthMetrics.incrementRequests();
    next();
});

// Connect to DB with security options
mongoose.connect(process.env.MONGO_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
}).then(() => console.log("MongoDB connected securely"))
  .catch(err => {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  });

// Enhanced session config
app.use(session({
    secret: (process.env.SESSION_SECRET?.split(',') || ['fallback-secret'])[0],
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        touchAfter: 24 * 3600,
        crypto: { secret: process.env.SESSION_SECRET }
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'strict'
    }
}));

app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.resolve("public")));
app.set('view engine', 'ejs');

// ===== IMPORT ALL ROUTES =====

// Auth routes
import authLoginRoutes from "./routes/auth/login.js";
import authRegisterRoutes from "./routes/auth/register.js";
import authPasswordResetRoutes from "./routes/auth/password-reset.js";

// Public routes
import publicRoutes from "./routes/public/main.js";

// API routes
import mobileApiRoutes from "./routes/api/pages.js";
import apiTenantsRoutes from "./routes/api/tenants.js";
import apiTranslateRoutes from "./routes/api/translate.js";
import apiAuthRoutes from "./routes/api/auth.js";

// Admin routes
import adminGenerateRoutes from "./routes/admin/generate.js";
import adminPushManagerRoutes from "./routes/admin/push-manager.js";
import adminAbtestsRoutes from "./routes/admin/abtests.js";
import adminSeoRoutes from "./routes/admin/seo.js";
import adminSocialRoutes from "./routes/admin/social.js";
import adminSettingsRoutes from "./routes/admin/settings.js";
import adminUsersRoutes from "./routes/admin/users.js";
import adminDashboardRoutes from "./routes/admin/dashboard.js";
import adminDatabaseRoutes from "./routes/admin/database.js";

// Tenant routes
import tenantDashboardRoutes from "./routes/tenant/dashboard.js";
import tenantThemeRoutes from "./routes/tenant/theme.js";
import tenantUsageRoutes from "./routes/tenant/usage.js";

// Billing routes
import billingSubscriptionRoutes from "./routes/billing/subscription.js";
import billingWebhooksRoutes from "./routes/billing/webhooks.js";
import billingInvoicesRoutes from "./routes/billing/invoices.js";

import { serviceRegistry } from "./services/registry.js";
import aiService from "./services/ai.js";
import billingService from "./services/billing.js";
import massGeneratorService from "./services/massGenerator.js";

// ===== MIDDLEWARE FOR USER LOADING =====
// Load user into req.user if session exists
app.use(async (req, res, next) => {
    if (req.session.userId) {
        try {
            const User = (await import("./models/User.js")).default;
            req.user = await User.findById(req.session.userId).populate('planId');
        } catch (error) {
            console.error('Error loading user:', error);
            req.session.destroy();
        }
    }
    next();
});

// ===== MOUNT ROUTES =====

// Auth routes (no prefix)
app.use("/auth", authLimiter); // Apply auth rate limiting
app.use("/auth", authLoginRoutes);
app.use("/auth", authRegisterRoutes);
app.use("/auth", authPasswordResetRoutes);

// Public routes
app.use("/", publicRoutes);

// API routes with versioning
app.use("/api/v1", mobileApiRoutes);
app.use("/api/v1", apiTenantsRoutes);
app.use("/api/v1", apiTranslateRoutes);
app.use("/api/v1", apiAuthRoutes);

// Backward compatibility (keep old /api routes)
app.use("/api", mobileApiRoutes);
app.use("/api", apiTenantsRoutes);
app.use("/api", apiTranslateRoutes);
app.use("/api", apiAuthRoutes);

// Admin routes (require authentication)
app.use("/admin", adminDashboardRoutes);
app.use("/admin", adminGenerateRoutes);
app.use("/admin", adminPushManagerRoutes);
app.use("/admin", adminAbtestsRoutes);
app.use("/admin", adminSeoRoutes);
app.use("/admin", adminSocialRoutes);
app.use("/admin", adminSettingsRoutes);
app.use("/admin", adminUsersRoutes);
app.use("/admin", adminDatabaseRoutes);

// Tenant routes (require authentication)
app.use("/tenant", tenantDashboardRoutes);
app.use("/tenant", tenantThemeRoutes);
app.use("/tenant", tenantUsageRoutes);

// Billing routes (require authentication except webhooks)
app.use("/billing", billingSubscriptionRoutes);
app.use("/billing/webhooks", billingWebhooksRoutes); // Webhooks don't need auth
app.use("/billing", billingInvoicesRoutes);

// Register services with dependencies BEFORE starting server
async function initializeServices() {
    try {
        // Register all services
        serviceRegistry.register('logger', null, []); // Base service
        serviceRegistry.register('ai', aiService, ['logger']);
        serviceRegistry.register('billing', billingService, ['logger']);
        serviceRegistry.register('massGenerator', massGeneratorService, ['ai', 'billing', 'logger']);
        
        // Initialize critical services
        await serviceRegistry.initialize('ai');
        await serviceRegistry.initialize('billing');
        
        logger.info('Critical services initialized successfully');
        
    } catch (error) {
        logger.error('Service initialization failed', { error: error.message });
        process.exit(1);
    }
}

// Initialize services before starting server
initializeServices().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running securely on port ${PORT}`);
        console.log('Services status:', serviceRegistry.getStatus());
    });
});

// Enhanced health check
app.get('/health', (req, res) => {
    res.json({
        status: "ok",
        ...healthMetrics.getMetrics()
    });
});

// Root redirect
app.get('/', (req, res) => {
    if (req.user) {
        const redirectUrl = req.user.role === 'admin' ? '/admin' : '/tenant';
        return res.redirect(redirectUrl);
    }
    res.redirect('/auth/login');
});

// 404 handler
app.use(notFoundHandler);

// Global error handler (LAST!)
app.use(globalErrorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running securely on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    // Seed database on first run
    if (process.env.NODE_ENV !== 'production') {
        import('./services/seed.js').then(({ seedDatabase }) => {
            seedDatabase().catch(console.error);
        });
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    mongoose.connection.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received. Shutting down gracefully...');
    await serviceRegistry.shutdown();
    mongoose.connection.close();
    process.exit(0);
});

