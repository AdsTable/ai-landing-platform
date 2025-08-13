import express from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { validateSeoUrl } from "../../middleware/validation.js";
import { analyzeCompetitorSEO } from "../../services/seo-analyze.js";
import { suggestKeywordsFromText } from "../../services/keywords.js";

const router = express.Router();

// Add validation for SEO analysis
const validateSeoUrl = [
    body('url')
        .isURL()
        .withMessage('Valid URL required'),
    handleValidationErrors
];

router.get("/seo", 
    requireAuth, 
    requireRole("admin"), 
    (req, res) => {
        res.render("admin/seo", {
            title: "SEO Analysis",
            siteName: process.env.SITE_NAME || "AI Landing Platform",
            user: req.user,
            currentPage: 'seo',
            VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY
        });
    }
);

// POST endpoint for competitor analysis
router.post("/seo/analyze", 
    requireAuth, 
    requireRole("admin"),
    validateSeoUrl,
    asyncHandler(async (req, res) => {
        const { url } = req.body;
        
        const analysis = await analyzeCompetitorSEO(url);
        
        res.json({
            success: true,
            analysis
        });
    })
);

// POST endpoint for keyword generation
router.post("/seo/keywords", 
    requireAuth, 
    requireRole("admin"),
    asyncHandler(async (req, res) => {
        const { topic } = req.body;
        
        const keywords = await suggestKeywordsFromText(topic);
        
        res.json({
            success: true,
            keywords
        });
    })
);

export default router;
