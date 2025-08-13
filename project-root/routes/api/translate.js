import express from "express";
import { requireApiAuth } from "../../middleware/apiAuth.js";
import { validateTranslation } from "../../middleware/validation.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { aiLogger } from "../../services/logger.js"; // ✅ ADD MISSING IMPORT
import { translateText } from "../../services/translate.js";

const router = express.Router();

/**
 * POST /api/translate - translate text to target language
 */
router.post("/translate", 
    requireApiAuth,
    validateTranslation,
    asyncHandler(async (req, res) => {
        const startTime = Date.now();
        const { text, targetLang } = req.body;

        try {
            aiLogger.info('Translation request started', {
                targetLang,
                textLength: text.length,
                apiKeyPrefix: req.headers['x-api-key']?.slice(0, 8) + '...',
                ip: req.ip
            });

            const translated = await translateText(text, targetLang);
            const duration = Date.now() - startTime;

            aiLogger.info('Translation completed', {
                targetLang,
                duration,
                textLength: text.length,
                translatedLength: translated.length
            });

            // ✅ KEEP ORIGINAL SIMPLE RESPONSE FORMAT
            res.json({
                success: true,
                translated
            });

        } catch (error) {
            aiLogger.error('Translation failed', {
                targetLang,
                textLength: text.length,
                error: error.message,
                duration: Date.now() - startTime
            });
            
            throw error;
        }
    })
);

export default router;
