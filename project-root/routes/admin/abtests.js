import express from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { logger } from "../../services/logger.js";

const router = express.Router();

router.get("/abtests", 
    requireAuth, 
    requireRole("admin"), 
    asyncHandler(async (req, res) => {
        // Mock A/B test data - replace with real DB queries
        const activeTests = [
            {
                id: 1,
                name: "Landing Page Headline Test",
                status: "running",
                variants: 2,
                traffic: 50,
                conversions: { A: 12, B: 18 }
            }
        ];

        logger.info('A/B tests page accessed', { 
            adminId: req.user.id, 
            ip: req.ip 
        });

        res.render("admin/abtests", {
            title: "A/B Tests",
            siteName: process.env.SITE_NAME || "AI Landing Platform",
            user: req.user,
            currentPage: 'abtests',
            activeTests,
            VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY
        });
    })
);

export default router;
