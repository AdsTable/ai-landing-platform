import express from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validatePushMessage } from "../../middleware/validation.js"; // Remove pagination for now
import { asyncHandler } from "../../middleware/errorHandler.js";
import { securityLogger } from "../../services/logger.js"; // ✅ ADD MISSING IMPORT
import User from "../../models/User.js";
import Plan from "../../models/Plan.js";
import Tenant from "../../models/Tenant.js";
import { sendPush } from "../../services/push.js";

const router = express.Router();

/**
 * GET /admin/push
 * Show push subscriptions list with filter options (role, plan, tenant)
 * Also allows sending a test notification to the current admin
 */
router.get("/push", 
    requireAuth, 
    requireRole("admin"), 
    asyncHandler(async (req, res) => {
        const { role, planId, tenantId } = req.query;

        // Build MongoDB filter for push-enabled users
        const filter = { pushSubscription: { $exists: true, $ne: null } };
        if (role) filter.role = role;
        if (planId) filter.planId = planId;
        if (tenantId) filter.tenantId = tenantId;

        // Ability to send a test push to yourself
        if (req.query.test === 'true' && req.user.pushSubscription) {
            await sendPush(req.user, "Push Test", "Push notifications are working!");
            securityLogger.info('Test push sent', { 
                adminId: req.user.id, 
                ip: req.ip 
            });
        }

        // Fetch filtered users - ✅ KEEP ORIGINAL SIMPLE APPROACH
        const users = await User.find(filter).populate("planId").populate("tenantId");

        // Fetch available roles, plans, and tenants for filter dropdowns
        const roles = ["admin", "editor", "marketer", "client"];
        const plans = await Plan.find();
        const tenants = await Tenant.find();

        res.render("admin/push-manager", { 
            users, 
            roles, 
            plans, 
            tenants, 
            filters: { role, planId, tenantId }, 
            user: req.user,
            title: 'Push Manager', // ✅ ADD MISSING
            siteName: settings.siteName, // ✅ ADD MISSING
            VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY // ✅ ADD MISSING
        });
    })
);

/**
 * POST /admin/push/:userId
 * Send a push notification to a specific user
 */
router.post("/push/:userId", 
    requireAuth, 
    requireRole("admin"),
    validatePushMessage,
    asyncHandler(async (req, res) => {
        const user = await User.findById(req.params.userId);
        if (!user || !user.pushSubscription) {
            return res.status(404).json({ success: false, error: "User not subscribed" });
        }
        
        await sendPush(user, req.body.title || "Admin Notification", req.body.message || "No message");

        // Log push notification
        securityLogger.info('Push notification sent', {
            adminId: req.user.id,
            targetUserId: user.id,
            title: req.body.title,
            ip: req.ip
        });

        res.json({ success: true, message: "Notification sent." }); // ✅ KEEP ORIGINAL FORMAT
    })
);

/**
 * POST /admin/push/bulk
 * Send a push notification to all users that match the selected filters
 */
router.post("/push/bulk", 
    requireAuth, 
    requireRole("admin"),
    validatePushMessage,
    asyncHandler(async (req, res) => {
        const { role, planId, tenantId, title, message } = req.body;

        // Build filter for bulk selection
        const filter = { pushSubscription: { $exists: true, $ne: null } };
        if (role) filter.role = role;
        if (planId) filter.planId = planId;
        if (tenantId) filter.tenantId = tenantId;

        const users = await User.find(filter);
        const sendResults = [];

        for (const u of users) {
            try {
                await sendPush(u, title, message);
                sendResults.push({ user: u.username, status: "sent" });
            } catch (err) {
                sendResults.push({ user: u.username, status: "error", error: err.message });
            }
        }

        // Log bulk operation
        securityLogger.info('Bulk push notification sent', {
            adminId: req.user.id,
            filters: { role, planId, tenantId },
            targetCount: users.length,
            successCount: sendResults.filter(r => r.status === "sent").length,
            title,
            ip: req.ip
        });

        res.json({ success: true, count: sendResults.length, results: sendResults }); // ✅ KEEP ORIGINAL FORMAT
    })
);

export default router;
