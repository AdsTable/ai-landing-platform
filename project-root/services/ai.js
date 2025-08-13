import axios from "axios";
import tough from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { logger } from "./logger.js";
import { serviceRegistry } from "./registry.js";

dotenv.config();

// Setup axios with cookie support for AI API calls
const jar = new tough.CookieJar();
const client = wrapper(axios.create({ 
    jar,
    timeout: 30000,
    headers: {
        'User-Agent': 'AI-Landing-Platform/1.0'
    }
}));

class AIService {
    constructor() {
        this.openaiKey = process.env.OPENAI_API_KEY;
        this.baseURL = 'https://api.openai.com/v1';
        this.initialized = false;
    }

    async initialize() {
        if (!this.openaiKey) {
            throw new Error('OpenAI API key not configured');
        }
        
        // Test API connectivity
        const isValid = await this.validateApiKey();
        if (!isValid) {
            throw new Error('Invalid OpenAI API key');
        }

        this.initialized = true;
        logger.info('AI Service initialized');
    }

    async validateApiKey() {
        try {
            const response = await client.get(`${this.baseURL}/models`, {
                headers: {
                    'Authorization': `Bearer ${this.openaiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.status === 200;
        } catch (error) {
            logger.error('OpenAI API key validation failed', { error: error.message });
            return false;
        }
    }

    /**
     * Generate description with billing checks
     */
    async generateDescription(industry, location, type, lang, userId = null) {
        if (!this.initialized) {
            throw new Error('AI Service not initialized');
        }

        // Check user limits if userId provided
        if (userId) {
            const billingService = await serviceRegistry.get('billing').catch(() => null);
            if (billingService) {
                const canGenerate = await billingService.checkGenerationLimit(userId);
                if (!canGenerate) {
                    throw new Error('Generation limit exceeded for user plan');
                }
            }
        }

        try {
            const prompt = this.buildPrompt(industry, location, type, lang);

            const response = await client.post(`${this.baseURL}/completions`, {
                model: "gpt-3.5-turbo-instruct",
                prompt,
                max_tokens: 400,
                temperature: 0.7,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0
            }, {
                headers: {
                    'Authorization': `Bearer ${this.openaiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status !== 200) {
                throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
            }

            const data = response.data;
            const description = data.choices?.[0]?.text?.trim() || '';

            if (!description) {
                throw new Error('Empty response from OpenAI API');
            }

            // Track usage if billing service available
            const billingService = await serviceRegistry.get('billing').catch(() => null);
            if (billingService && userId) {
                await billingService.trackUsage(userId, 'generation', 1);
            }

            logger.info('AI description generated', {
                userId,
                industry,
                location,
                type,
                lang,
                tokens: data.usage?.total_tokens || 0,
                charactersGenerated: description.length
            });

            return description;

        } catch (error) {
            logger.error('AI generation failed', {
                userId,
                industry,
                location,
                type,
                lang,
                error: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText
            });

            // Handle specific OpenAI errors
            if (error.response?.status === 401) {
                throw new Error('Invalid OpenAI API key');
            } else if (error.response?.status === 429) {
                throw new Error('OpenAI rate limit exceeded. Please try again later.');
            } else if (error.response?.status === 503) {
                throw new Error('OpenAI service temporarily unavailable');
            }
            
            throw error;
        }
    }

    /**
     * Build optimized prompt for content generation
     */
    buildPrompt(industry, location, type, lang) {
        const languageInstructions = {
            'en': 'Write in professional English',
            'es': 'Escribe en español profesional',
            'fr': 'Écrivez en français professionnel',
            'de': 'Schreiben Sie in professionellem Deutsch',
            'it': 'Scrivi in italiano professionale',
            'pt': 'Escreva em português profissional'
        };

        const instruction = languageInstructions[lang] || languageInstructions['en'];

        return `Generate a professional, SEO-optimized description for a ${industry} ${type} business in ${location}. 

Requirements:
- ${instruction}
- 150-300 words
- Include local keywords and location references
- Focus on benefits and unique selling points
- Include a call-to-action
- Make it engaging and conversion-focused
- Use professional tone suitable for business websites

Industry: ${industry}
Business Type: ${type}
Location: ${location}
Language: ${lang}

Description:`;
    }

    /**
     * Generate bulk content with proper error handling
     */
    async generateBulkContent(requests, userId = null) {
        const results = [];
        let successCount = 0;
        let failureCount = 0;

        logger.info('Starting bulk content generation', {
            userId,
            requestCount: requests.length
        });

        for (let i = 0; i < requests.length; i++) {
            const request = requests[i];
            
            try {
                const content = await this.generateDescription(
                    request.industry,
                    request.location,
                    request.type,
                    request.lang,
                    userId
                );

                results.push({
                    ...request,
                    content,
                    success: true,
                    index: i
                });
                successCount++;

                // Add delay between requests to avoid rate limiting
                if (i < requests.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

            } catch (error) {
                results.push({
                    ...request,
                    error: error.message,
                    success: false,
                    index: i
                });
                failureCount++;

                // Stop if too many failures (possible API issues)
                if (failureCount > requests.length * 0.5) {
                    logger.error('Bulk generation stopped - too many failures', {
                        userId,
                        successCount,
                        failureCount,
                        totalRequests: requests.length
                    });
                    break;
                }
            }

            // Progress logging every 10 items
            if ((i + 1) % 10 === 0) {
                logger.info('Bulk generation progress', {
                    userId,
                    completed: i + 1,
                    total: requests.length,
                    successCount,
                    failureCount
                });
            }
        }

        logger.info('Bulk content generation completed', {
            userId,
            totalRequests: requests.length,
            successCount,
            failureCount,
            successRate: ((successCount / requests.length) * 100).toFixed(1) + '%'
        });

        return {
            results,
            summary: {
                total: requests.length,
                success: successCount,
                failed: failureCount,
                successRate: ((successCount / requests.length) * 100).toFixed(1) + '%'
            }
        };
    }

    async shutdown() {
        this.initialized = false;
        logger.info('AI Service shutdown');
    }
}

const aiService = new AIService();

// Export legacy functions for backward compatibility
export async function generateDescription(industry, location, type, lang, userId) {
    return await aiService.generateDescription(industry, location, type, lang, userId);
}

export async function generateBulkContent(requests, userId) {
    return await aiService.generateBulkContent(requests, userId);
}

export async function validateAiApiKey() {
    return await aiService.validateApiKey();
}

export async function getAiUsageStats() {
    // Mock implementation - in real app, track API usage
    return {
        tokensUsed: 0,
        requestsThisMonth: 0,
        estimatedCost: 0
    };
}

export default aiService;
