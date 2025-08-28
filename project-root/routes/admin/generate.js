import express from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { checkGenerationLimit } from "../../middleware/limits.js";
import { validatePageGeneration } from "../../middleware/validation.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { aiLogger } from "../../services/logger.js"; // ✅ ADD MISSING IMPORT
import settings from "../../config/settings.js";
import { generateDescription } from "../../services/ai.js";
import { generateImage } from "../../services/images.js";
import { translateText } from "../../services/translate.js";
import { saveToCache } from "../../services/cache.js";

const router = express.Router();

/**
 * GET /admin/generate
 * Render the page generation form for admin
 */
router.get("/generate", requireAuth, requireRole("admin"), (req, res) => {
    res.render("admin/generate", {
        industries: settings.industries,
        languages: settings.languages,
        lang: "en",
        apiKey: process.env.API_KEY, // for translate button in UI
        siteName: settings.siteName,
        user: req.user,
        VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
        title: 'Generate Page'
    });
});

/**
 * POST /admin/generate
 * Process the form submission: generate text, optional image, translations, store in cache
 */
router.post(
    "/generate",
    requireAuth,
    requireRole("admin"),
    validatePageGeneration, // ✅ Keep validation
    checkGenerationLimit,
    asyncHandler(async (req, res) => {
        const startTime = Date.now();
        const { industry, location, type, lang, previewTranslations, content } = req.body; // ✅ ADD content from original

        try {
            // ✅ RESTORE ORIGINAL LOGIC: Use custom content if provided, otherwise generate
            const seoText = content && content.trim() 
                ? content.trim()
                : await generateDescription(industry, location, type, lang);

            // Log AI operation start
            aiLogger.info('Page generation started', {
                userId: req.user.id,
                industry,
                location,
                type,
                lang,
                hasCustomContent: !!(content && content.trim()),
                timestamp: new Date()
            });

            // Step 2: Generate image if enabled
            const imageUrl = settings.modules.aiImages
                ? await generateImage(`${industry} ${type} in ${location}, ${lang}`)
                : null;

            // Step 3: Pretranslate into other languages for this tenant
            const tenantLanguages = settings.languages.map(l => l.code).filter(lc => lc !== lang);
            const translations = {};
            for (const tLang of tenantLanguages) {
                translations[tLang] = await translateText(seoText, tLang);
            }

            // Step 4: Save data in cache
            const cacheKey = `${industry}-${lang}-${location}-${type}`;
            saveToCache(cacheKey, { seoText, imageUrl, translations });

            // Step 5: Increment user's counter (plan usage)
            req.user.generatedThisMonth += 1;
            await req.user.save();

            const duration = Date.now() - startTime;

            // Log successful generation
            aiLogger.info('Page generation completed', {
                userId: req.user.id,
                industry,
                location,
                type,
                lang,
                duration,
                hasImage: !!imageUrl,
                translationsCount: Object.keys(translations).length,
                timestamp: new Date()
            });

            // Step 6: Redirect to the generated page (public route)
            const previewFlag = previewTranslations ? "?previewTranslations=true" : "";
            res.redirect(`/market/${industry}/${lang}/${location}/${type}${previewFlag}`);

        } catch (err) {
            aiLogger.error('Page generation failed', {
                userId: req.user.id,
                industry,
                location,
                type,
                lang,
                error: err.message,
                duration: Date.now() - startTime,
                timestamp: new Date()
            });
            
            throw err; // asyncHandler will catch
        }
    })
);

export default router;
