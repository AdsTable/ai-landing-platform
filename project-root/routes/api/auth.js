import express from "express";
import { requireApiAuth } from "../../middleware/apiAuth.js";

const router = express.Router();

// Simple API auth test
router.get("/me", requireApiAuth, (req, res) => {
    res.json({ user: "API key valid" });
});

export default router;
