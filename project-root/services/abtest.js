import { generateDescription } from './ai.js';
import { saveToCache, getFromCache } from './cache.js';

/**
 * Create A/B test variant
 */
export async function createABVariant(industry, location, type, lang, variant) {
    const key = `${industry}-${lang}-${location}-${type}-v${variant}`.toLowerCase();
    if (!getFromCache(key)) {
        const text = await generateDescription(`${industry} (variant ${variant})`, location, type, lang);
        saveToCache(key, { text });
    }
    return key;
}

/**
 * Determine winning variant based on metrics
 */
export function decideWinner(variantData) {
    return variantData.sort((a, b) => b.conv - a.conv)[0];
}
