import express from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import Tenant from "../../models/Tenant.js";

const router = express.Router();

router.get("/theme", requireAuth, requireRole("client"), async (req, res) => {
    const tenant = await Tenant.findById(req.user.tenantId);
    res.render("tenant/theme-editor", { tenant });
});

router.post("/theme", requireAuth, requireRole("client"), async (req, res) => {
    const { primaryColor, logoUrl } = req.body;
    await Tenant.findByIdAndUpdate(req.user.tenantId, { primaryColor, logoUrl });
    res.redirect("/tenant/dashboard");
});

export default router;
