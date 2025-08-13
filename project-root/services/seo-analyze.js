import axios from "axios";
import tough from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";
import * as cheerio from "cheerio";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { suggestKeywordsFromText } from "./keywords.js";
import { logger } from "./logger.js";

dotenv.config();

// Setup axios with cookie support
const jar = new tough.CookieJar();
const client = wrapper(axios.create({ jar }));

/**
 * Analyze competitor page for SEO factors
 */
export async function analyzeCompetitorSEO(url) {
    try {
        logger.info('Starting SEO analysis', { url });

        const response = await client.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 15000,
            maxRedirects: 5
        });

        if (response.status !== 200) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const html = response.data;
        const $ = cheerio.load(html);

        // Extract SEO elements
        const title = $('title').text().trim() || '';
        const metaDescription = $('meta[name="description"]').attr('content') || '';
        const metaKeywords = $('meta[name="keywords"]').attr('content') || '';
        
        // Extract Open Graph data
        const ogTitle = $('meta[property="og:title"]').attr('content') || '';
        const ogDescription = $('meta[property="og:description"]').attr('content') || '';
        const ogImage = $('meta[property="og:image"]').attr('content') || '';
        
        // Extract Twitter Card data
        const twitterTitle = $('meta[name="twitter:title"]').attr('content') || '';
        const twitterDescription = $('meta[name="twitter:description"]').attr('content') || '';
        
        // Extract structured data
        const jsonLdScripts = [];
        $('script[type="application/ld+json"]').each((i, el) => {
            try {
                const data = JSON.parse($(el).html());
                jsonLdScripts.push(data);
            } catch (e) {
                // Invalid JSON-LD, skip
            }
        });

        // Extract headings structure
        const headings = [];
        $('h1, h2, h3, h4, h5, h6').each((i, el) => {
            headings.push({
                level: parseInt(el.tagName.substring(1)),
                text: $(el).text().trim().substring(0, 100)
            });
        });

        // Extract images and their alt tags
        const images = [];
        $('img').each((i, el) => {
            const $img = $(el);
            images.push({
                src: $img.attr('src'),
                alt: $img.attr('alt') || '',
                hasAlt: !!$img.attr('alt'),
                title: $img.attr('title') || ''
            });
        });

        // Extract internal/external links
        const links = [];
        $('a[href]').each((i, el) => {
            const $link = $(el);
            const href = $link.attr('href');
            if (href) {
                const isExternal = href.startsWith('http') && !href.includes(new URL(url).hostname);
                links.push({
                    href: href,
                    text: $link.text().trim().substring(0, 50),
                    isExternal,
                    hasTitle: !!$link.attr('title'),
                    rel: $link.attr('rel') || ''
                });
            }
        });

        // Content analysis
        const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
        const wordCount = bodyText.split(' ').filter(word => word.length > 0).length;
        
        // Check for common SEO elements
        const hasRobotsMeta = $('meta[name="robots"]').length > 0;
        const hasCanonical = $('link[rel="canonical"]').length > 0;
        const hasViewport = $('meta[name="viewport"]').length > 0;
        const hasLangAttr = $('html').attr('lang');

        // Performance hints
        const hasPreload = $('link[rel="preload"]').length > 0;
        const hasPrefetch = $('link[rel="prefetch"]').length > 0;
        
        // Get keyword suggestions from content
        const contentSample = title + ' ' + metaDescription + ' ' + headings.map(h => h.text).join(' ');
        const keywordHints = await suggestKeywordsFromText(contentSample);

        const analysis = {
            url: url,
            analyzedAt: new Date(),
            
            // Basic SEO
            title: {
                text: title,
                length: title.length,
                isOptimal: title.length >= 30 && title.length <= 60,
                hasKeywords: !!title
            },
            metaDescription: {
                text: metaDescription,
                length: metaDescription.length,
                isOptimal: metaDescription.length >= 120 && metaDescription.length <= 160,
                exists: !!metaDescription
            },
            metaKeywords: {
                text: metaKeywords,
                exists: !!metaKeywords
            },
            
            // Open Graph
            openGraph: {
                title: ogTitle,
                description: ogDescription,
                image: ogImage,
                isComplete: !!(ogTitle && ogDescription && ogImage)
            },
            
            // Twitter Cards
            twitterCard: {
                title: twitterTitle,
                description: twitterDescription,
                isComplete: !!(twitterTitle && twitterDescription)
            },
            
            // Structured Data
            structuredData: {
                count: jsonLdScripts.length,
                types: jsonLdScripts.map(script => script['@type']).filter(Boolean),
                hasStructuredData: jsonLdScripts.length > 0
            },
            
            // Headings
            headings: {
                structure: headings,
                h1Count: headings.filter(h => h.level === 1).length,
                hasProperStructure: headings.filter(h => h.level === 1).length === 1,
                totalHeadings: headings.length
            },
            
            // Images
            images: {
                total: images.length,
                withAlt: images.filter(img => img.hasAlt).length,
                altOptimization: images.length > 0 ? 
                    (images.filter(img => img.hasAlt).length / images.length * 100).toFixed(1) : 0,
                withTitle: images.filter(img => img.title).length
            },
            
            // Links
            links: {
                total: links.length,
                internal: links.filter(l => !l.isExternal).length,
                external: links.filter(l => l.isExternal).length,
                withNofollow: links.filter(l => l.rel.includes('nofollow')).length
            },
            
            // Content
            content: {
                wordCount: wordCount,
                isOptimal: wordCount >= 300,
                textLength: bodyText.length
            },
            
            // Technical SEO
            technical: {
                hasRobotsMeta,
                hasCanonical,
                hasViewport,
                hasLangAttr: !!hasLangAttr,
                langAttr: hasLangAttr || '',
                hasPreload,
                hasPrefetch
            },
            
            // Keywords
            keywordHints: keywordHints || [],
            
            // SEO Score (simple calculation)
            score: calculateSeoScore({
                title: title.length >= 30 && title.length <= 60,
                metaDescription: metaDescription.length >= 120 && metaDescription.length <= 160,
                h1Count: headings.filter(h => h.level === 1).length === 1,
                altTags: images.length === 0 || (images.filter(img => img.hasAlt).length / images.length) > 0.8,
                wordCount: wordCount >= 300,
                hasCanonical,
                hasViewport,
                hasStructuredData: jsonLdScripts.length > 0
            })
        };

        logger.info('SEO analysis completed', { 
            url, 
            titleLength: analysis.title.length,
            wordCount: analysis.content.wordCount,
            score: analysis.score
        });

        return analysis;

    } catch (error) {
        logger.error('SEO analysis failed', { url, error: error.message });
        
        if (error.code === 'ENOTFOUND') {
            throw new Error('Domain not found or DNS resolution failed');
        } else if (error.code === 'ECONNREFUSED') {
            throw new Error('Connection refused - server may be down');
        } else if (error.response?.status === 403) {
            throw new Error('Access forbidden - site blocks automated requests');
        } else if (error.response?.status === 404) {
            throw new Error('Page not found');
        } else if (error.code === 'ETIMEDOUT') {
            throw new Error('Request timeout - site took too long to respond');
        }
        
        throw error;
    }
}

/**
 * Calculate SEO score based on various factors
 */
function calculateSeoScore(factors) {
    const weights = {
        title: 15,
        metaDescription: 15,
        h1Count: 10,
        altTags: 10,
        wordCount: 15,
        hasCanonical: 10,
        hasViewport: 5,
        hasStructuredData: 20
    };
    
    let score = 0;
    let maxScore = 0;
    
    for (const [factor, weight] of Object.entries(weights)) {
        maxScore += weight;
        if (factors[factor]) {
            score += weight;
        }
    }
    
    return Math.round((score / maxScore) * 100);
}

/**
 * Get page load speed metrics (simplified)
 */
export async function getPageSpeed(url) {
    try {
        const start = Date.now();
        await client.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; SEO-Analyzer/1.0)'
            }
        });
        const loadTime = Date.now() - start;
        
        return {
            loadTime,
            rating: loadTime < 1000 ? 'fast' : loadTime < 3000 ? 'moderate' : 'slow'
        };
        
    } catch (error) {
        logger.error('Page speed check failed', { url, error: error.message });
        return {
            loadTime: null,
            rating: 'error',
            error: error.message
        };
    }
}
