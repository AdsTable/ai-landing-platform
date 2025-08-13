import express from "express";
import { param } from "express-validator";
import { handleValidationErrors } from "../../middleware/validation.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { logger } from "../../services/logger.js";
import { generateDescription } from "../../services/ai.js";
import { generateImage } from "../../services/images.js";
import { translateText } from "../../services/translate.js";
import { saveToCache, getFromCache } from "../../services/cache.js";
import settings from "../../config/settings.js";

const router = express.Router();

// URL parameters validation
const validateLandingParams = [
    param('industry')
        .isString()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Invalid industry parameter'),
    param('lang')
        .isString()
        .matches(/^[a-z]{2}(-[A-Z]{2})?$/)
        .withMessage('Invalid language code'),
    param('location')
        .isString()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Invalid location parameter'),
    param('type')
        .isString()
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Invalid type parameter'),
    handleValidationErrors
];

/**
 * Route: Generates (or retrieves from cache) a landing page
 * with automatic translations for all other active languages.
 */
router.get("/market/:industry/:lang/:location/:type", 
    validateLandingParams, // Add validation
    asyncHandler(async (req, res) => { // Wrap in asyncHandler
        const { industry, lang, location, type } = req.params;
        const previewTranslations = req.query.previewTranslations === 'true';
        
        // Log request for public page access
        logger.info('Public landing page requested', {
            industry,
            lang,
            location,
            type,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            previewMode: previewTranslations
        });

        // Unique cache key per language
        const cacheKey = `${industry}-${lang}-${location}-${type}`;
        let pageData = getFromCache(cacheKey);

        if (!pageData) {
            // Log cache miss and start generation
            logger.info('Cache miss - starting content generation', {
                cacheKey,
                industry,
                lang,
                location,
                type
            });

            const startTime = Date.now();

            try {
                // Step 1: Generate main SEO text in requested language
                const seoText = await generateDescription(industry, location, type, lang);

                // Step 2: Generate image (if enabled) - parallel operation for performance
                const imageUrl = settings.modules.aiImages
                    ? await generateImage(`${industry} ${type} in ${location}, ${lang}`)
                    : null;

                // Step 3: Translations for other tenant languages (excluding current one)
                const tenantLanguages = settings.languages.map(l => l.code).filter(l => l !== lang);
                const translations = {};
                
                for (const tLang of tenantLanguages) {
                    translations[tLang] = await translateText(seoText, tLang);
                }

                // Step 4: Save to cache
                pageData = { seoText, imageUrl, translations };
                saveToCache(cacheKey, pageData);

                const duration = Date.now() - startTime;
                
                // Log successful generation
                logger.info('Content generation completed', {
                    cacheKey,
                    duration,
                    seoTextLength: seoText.length,
                    hasImage: !!imageUrl,
                    translationsCount: Object.keys(translations).length,
                    languages: tenantLanguages
                });

            } catch (error) {
                // Log generation error
                logger.error('Content generation failed', {
                    cacheKey,
                    industry,
                    lang,
                    location,
                    type,
                    error: error.message,
                    duration: Date.now() - startTime
                });
                
                throw error; // async
