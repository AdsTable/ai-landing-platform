import { getTrendingCities } from './trends.js';
import { generateDescription } from './ai.js';
import { generateImage } from './images.js';
import { saveToCache } from './cache.js';
import settings from '../config/settings.js';

/**
 * Mass generate landing pages for tenant
 */
export async function massGenerate(tenant, industryKey, lang) {
    const industry = settings.industries.find(i => i.key === industryKey);
    if (!industry) return;
    const cities = await getTrendingCities();
    for (const city of cities) {
        for (const type of industry.types[lang]) {
            const key = `${industry.key}-${lang}-${city}-${type}-${tenant._id}`.toLowerCase();
            const text = await generateDescription(industry.name[lang], city, type, lang);
            const imageUrl = settings.modules.aiImages
                ? await generateImage(`${industry.name[lang]} ${type} in ${city}, ${lang}`)
                : null;
            saveToCache(key, { text, imageUrl, tenantId: tenant._id });
        }
    }
}
