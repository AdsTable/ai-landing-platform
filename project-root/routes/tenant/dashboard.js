import express from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { getAllCacheKeys } from "../../services/cache.js";
import Tenant from "../../models/Tenant.js";

const router = express.Router();

// Tenant dashboard
router.get("/dashboard", requireAuth, requireRole("client"), async (req, res) => {
    const tenant = await Tenant.findById(req.user.tenantId).populate("planId");
    const tenantKeys = getAllCacheKeys().filter(k => k.includes(tenant._id.toString()));

    res.render("tenant/dashboard", {
        tenant,
        pages: tenantKeys.map(k => ({ key: k, url: `/market/${k}` })),
        usage: {
            generated: req.user.generatedThisMonth,
            limit: tenant.planId.limits.pagesPerMonth
        }
    });
});

export default router;
