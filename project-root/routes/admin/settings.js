import express from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { body } from "express-validator";
import { handleValidationErrors } from "../../middleware/validation.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import settings from "../../config/settings.js";

const router = express.Router();

// Validation for settings update
const validateSettings = [
    body('siteName')
        .optional()
        .isString()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Site name must be 1-100 characters'),
    body('defaultLanguage')
        .optional()
        .isString()
        .isIn(['en', 'es', 'fr', 'de'])
        .withMessage('Invalid default language'),
    handleValidationErrors
];

router.get("/settings", 
    requireAuth, 
    requireRole("admin"), 
    (req, res) => {
        res.render("admin/settings", {
            title: "Platform Settings",
            siteName: process.env.SITE_NAME || "AI Landing Platform",
            user: req.user,
            currentPage: 'settings',
            settings: {
                siteName: settings.siteName,
                languages: settings.languages,
                modules: settings.modules,
                industries: settings.industries
            },
            VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY
        });
    }
);

// POST endpoint to update settings
router.post("/settings", 
    requireAuth, 
    requireRole("admin"),
    validateSettings,
    asyncHandler(async (req, res) => {
        const { siteName, defaultLanguage, enableAiImages, enableAutoTranslation } = req.body;
        
        // In a real app, these would be saved to database
        // For now, just validate and respond
        
        res.json({
            success: true,
            message: "Settings updated successfully",
            updatedSettings: {
                siteName,
                defaultLanguage,
                enableAiImages: enableAiImages === 'on',
                enableAutoTranslation: enableAutoTranslation === 'on'
            }
        });
    })
);

export default router;
