import fs from "fs";
import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import mongoose from "mongoose";
import path from "path";
import dotenv from "dotenv";

import { helmetConfig, corsConfig, generalLimiter, authLimiter, sanitizeInput } from "./middleware/security.js";
import { globalErrorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { requestLogger, healthMetrics } from "./middleware/monitoring.js";
import mongoSanitize from "express-mongo-sanitize";
import cors from "cors";

import { bootstrapServices } from "./services/bootstrap.js";
import { serviceRegistry } from "./services/registry.js";

import healthRoutes from "./routes/health.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure required directories exist
const requiredDirs = ["public/uploads", "logs", "migrations", "docs"];
requiredDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

// Trust proxy to get correct req.ip and apply rate limits behind proxies
app.set("trust proxy", 1);

// Security middleware
app.use(helmetConfig);
app.use(cors(corsConfig));
app.use(mongoSanitize());
app.use(sanitizeInput);

// Rate limiting
app.use(generalLimiter);

// Request monitoring
app.use(requestLogger);
app.use((req, res, next) => {
  healthMetrics.incrementRequests();
  next();
});

// DB connection
mongoose
  .connect(process.env.MONGO_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(() => console.log("MongoDB connected securely"))
  .catch((err) => {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  });

// Sessions
app.use(
  session({
    secret: (process.env.SESSION_SECRET?.split(",") || ["fallback-secret"])[0],
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      touchAfter: 24 * 3600,
      crypto: { secret: process.env.SESSION_SECRET },
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: "strict",
    },
  })
);

app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.resolve("public")));
app.set("view engine", "ejs");

// ===== ROUTES IMPORTS (same as before) =====
import authLoginRoutes from "./routes/auth/login.js";
import authRegisterRoutes from "./routes/auth/register.js";
import authPasswordResetRoutes from "./routes/auth/password-reset.js";
import publicRoutes from "./routes/public/main.js";
import mobileApiRoutes from "./routes/api/pages.js";
import apiTenantsRoutes from "./routes/api/tenants.js";
import apiTranslateRoutes from "./routes/api/translate.js";
import apiAuthRoutes from "./routes/api/auth.js";
import adminGenerateRoutes from "./routes/admin/generate.js";
import adminPushManagerRoutes from "./routes/admin/push-manager.js";
import adminAbtestsRoutes from "./routes/admin/abtests.js";
import adminSeoRoutes from "./routes/admin/seo.js";
import adminSocialRoutes from "./routes/admin/social.js";
import adminSettingsRoutes from "./routes/admin/settings.js";
import adminUsersRoutes from "./routes/admin/users.js";
import adminDashboardRoutes from "./routes/admin/dashboard.js";
import adminDatabaseRoutes from "./routes/admin/database.js";
import tenantDashboardRoutes from "./routes/tenant/dashboard.js";
import tenantThemeRoutes from "./routes/tenant/theme.js";
import tenantUsageRoutes from "./routes/tenant/usage.js";
import billingSubscriptionRoutes from "./routes/billing/subscription.js";
import billingWebhooksRoutes from "./routes/billing/webhooks.js";
import billingInvoicesRoutes from "./routes/billing/invoices.js";

// Load user to req.user from session if present
app.use(async (req, res, next) => {
  if (req.session.userId) {
    try {
      const User = (await import("./models/User.js")).default;
      req.user = await User.findById(req.session.userId).populate("planId");
    } catch (error) {
      console.error("Error loading user:", error);
      req.session.destroy();
    }
  }
  next();
});

// Mount routes
app.use("/auth", authLimiter);
app.use("/auth", authLoginRoutes);
app.use("/auth", authRegisterRoutes);
app.use("/auth", authPasswordResetRoutes);

app.use("/", publicRoutes);

app.use("/api/v1", mobileApiRoutes);
app.use("/api/v1", apiTenantsRoutes);
app.use("/api/v1", apiTranslateRoutes);
app.use("/api/v1", apiAuthRoutes);

app.use("/api", mobileApiRoutes);
app.use("/api", apiTenantsRoutes);
app.use("/api", apiTranslateRoutes);
app.use("/api", apiAuthRoutes);

app.use("/admin", adminDashboardRoutes);
app.use("/admin", adminGenerateRoutes);
app.use("/admin", adminPushManagerRoutes);
app.use("/admin", adminAbtestsRoutes);
app.use("/admin", adminSeoRoutes);
app.use("/admin", adminSocialRoutes);
app.use("/admin", adminSettingsRoutes);
app.use("/admin", adminUsersRoutes);
app.use("/admin", adminDatabaseRoutes);

app.use("/tenant", tenantDashboardRoutes);
app.use("/tenant", tenantThemeRoutes);
app.use("/tenant", tenantUsageRoutes);

app.use("/billing", billingSubscriptionRoutes);
app.use("/billing/webhooks", billingWebhooksRoutes);
app.use("/billing", billingInvoicesRoutes);

// ===== HEALTH ENDPOINTS =====

// Mount health routes
app.use("/health", healthRoutes);

// Lightweight app health
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    ...healthMetrics.getMetrics(),
  });
});

// 404 and error handlers
app.use(notFoundHandler);
app.use(globalErrorHandler);

// ===== START SERVER AFTER BOOTSTRAP =====
async function start() {
  try {
    await bootstrapServices();

    app.listen(PORT, () => {
      console.log(`Server running securely on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);

      if (process.env.NODE_ENV !== "production") {
        import("./services/seed.js").then(({ seedDatabase }) => {
          seedDatabase().catch(console.error);
        });
      }
    });
  } catch (error) {
    console.error("Failed to bootstrap services:", error);
    process.exit(1);
  }
}

start();

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  mongoose.connection.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received. Shutting down gracefully...");
  await serviceRegistry.shutdown();
  mongoose.connection.close();
  process.exit(0);
});