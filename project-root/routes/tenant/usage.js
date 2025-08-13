import express from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import User from "../../models/User.js";

const router = express.Router();

router.get("/usage", 
    requireAuth, 
    requireRole("client"), 
    asyncHandler(async (req, res) => {
        // Get current user's usage statistics
        const user = await User.findById(req.user.id).populate('planId');
        
        if (!user) {
            return res.status(404).send('User not found');
        }

        const currentDate = new Date();
        const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

        // Mock usage data - in real app, query from usage logs
        const usageStats = {
            pagesGenerated: {
                current: user.generatedThisMonth || 0,
                limit: user.planId?.limits?.monthlyGenerations || 20
            },
            apiCalls: {
                current: user.apiCallsThisMonth || 0,
                limit: user.planId?.limits?.monthlyApiCalls || 1000
            },
            translations: {
                current: user.translationsThisMonth || 0,
                limit: user.planId?.limits?.monthlyTranslations || 500
            }
        };

        // Calculate percentages
        Object.keys(usageStats).forEach(key => {
            const stat = usageStats[key];
            stat.percentage = Math.min((stat.current / stat.limit) * 100, 100);
            stat.remaining = Math.max(stat.limit - stat.current, 0);
        });

        res.render("tenant/usage", {
            title: "Usage Statistics",
            tenant: req.tenant,
            user: req.user,
            plan: user.planId,
            usageStats,
            currentMonth: monthStart.toLocaleDateString('en-US', { 
                month: 'long', 
                year: 'numeric' 
            }),
            VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY
        });
    })
);

export default router;
