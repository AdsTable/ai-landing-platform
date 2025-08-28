import { getTrendingCities } from './trends.js';
import { generateDescription } from './ai.js';
import { generateImage } from './images.js';
import { saveToCache } from './cache.js';
import { translateText } from './translate.js';
import { sendNotification } from './push.js';
import { updateAnalytics } from './analytics.js';
import { sendEmail } from './email.js';
import { optimizeSeo } from './seo-analyze.js';
import { extractKeywords } from './keywords.js';
import { postToSocial } from './social.js';
import settings from '../config/settings.js';
import { logger, aiLogger } from './logger.js';

/**
 * Mass generate landing pages for enterprise clients
 * Handles bulk content generation across multiple cities and languages
 */
export async function massGenerate(tenant, industryKey, lang = 'en') {
    try {
        aiLogger.info('Starting mass generation', { 
            tenantId: tenant._id, 
            industry: industryKey, 
            language: lang 
        });

        const industry = settings.industries.find(i => i.key === industryKey);
        if (!industry) {
            throw new Error(`Industry ${industryKey} not found in settings`);
        }

        // Get trending cities for content generation
        const cities = await getTrendingCities();
        const generatedPages = [];
        
        // Generate content for each city and type combination
        for (const city of cities) {
            for (const type of industry.types[lang]) {
                try {
                    const pageData = await generateSinglePage(tenant, industry, city, type, lang);
                    generatedPages.push(pageData);
                    
                    // Add delay to prevent API rate limiting
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                } catch (error) {
                    logger.error('Failed to generate page', { 
                        city, 
                        type, 
                        error: error.message 
                    });
                }
            }
        }

        // Send completion notification
        await sendNotification(tenant.adminUserId, {
            title: 'Mass Generation Complete',
            message: `Generated ${generatedPages.length} landing pages for ${industryKey}`
        });

        aiLogger.info('Mass generation completed', { 
            tenantId: tenant._id,
            pagesGenerated: generatedPages.length
        });

        return generatedPages;

    } catch (error) {
        logger.error('Mass generation failed', { 
            tenantId: tenant._id, 
            error: error.message 
        });
        throw error;
    }
}

/**
 * Generate a single landing page with AI content
 */
async function generateSinglePage(tenant, industry, city, type, lang) {
    // Create unique cache key
    const key = `${industry.key}-${lang}-${city}-${type}-${tenant._id}`.toLowerCase();
    
    // Generate AI description
    const text = await generateDescription(industry.name[lang], city, type, lang);
    
    // Generate AI image if enabled
    const imageUrl = settings.modules.aiImages
        ? await generateImage(`${industry.name[lang]} ${type} in ${city}`)
        : null;
    
    // Extract SEO keywords
    const keywords = await extractKeywords(text, lang);
    
    // Optimize for SEO
    const seoData = await optimizeSeo(text, keywords);
    
    // Translate to additional languages if specified
    const translations = {};
    if (tenant.allowedLanguages?.length > 1) {
        for (const targetLang of tenant.allowedLanguages) {
            if (targetLang !== lang) {
                translations[targetLang] = await translateText(text, targetLang);
            }
        }
    }
    
    const pageData = {
        key,
        text,
        imageUrl,
        keywords,
        seoData,
        translations,
        tenantId: tenant._id,
        industry: industry.key,
        city,
        type,
        language: lang,
        createdAt: new Date()
    };
    
    // Save to cache for quick access
    saveToCache(key, pageData);
    
    // Update analytics
    await updateAnalytics('page_generated', {
        tenantId: tenant._id,
        industry: industry.key,
        language: lang
    });
    
    return pageData;
}

/**
 * Schedule mass generation for all active tenants
 */
export async function scheduleMassGeneration() {
    try {
        logger.info('Starting scheduled mass generation for all tenants');
        
        // This would typically fetch from database
        // const activeTenants = await Tenant.find({ active: true }).populate('planId');
        
        // For now, using mock data
        const mockTenants = [
            { _id: '1', name: 'Real Estate Demo', allowedLanguages: ['en', 'es'] },
            { _id: '2', name: 'Tourism Demo', allowedLanguages: ['en'] }
        ];
        
        for (const tenant of mockTenants) {
            await massGenerate(tenant, 'real_estate', 'en');
        }
        
        logger.info('Scheduled mass generation completed');
        
    } catch (error) {
        logger.error('Scheduled mass generation failed', { error: error.message });
        throw error;
    }
}