import express from "express";
import { requireApiAuth } from "../../middleware/apiAuth.js";

const router = express.Router();

router.use(requireApiAuth);

// List tenants
router.get("/tenants", (req, res) => {
    res.json([{ id: 1, name: "Demo Tenant" }]);
});

export default router;
