import express from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { getAllCacheKeys } from "../../services/cache.js";
import { analyzeTraffic } from "../../services/analytics.js";
import settings from "../../config/settings.js";

const router = express.Router();

// Admin dashboard
router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
    const keys = getAllCacheKeys();
    const analytics = await analyzeTraffic(
        keys.map(k => ({ url: `${settings.baseUrl}/market/${k}` }))
    );

    res.render("admin/dashboard", {
        keys,
        analytics
    });
});

export default router;
