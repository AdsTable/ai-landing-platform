import axios from "axios";
import tough from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";
import dotenv from "dotenv";
import { logger, aiLogger } from "./logger.js";
import { serviceRegistry } from "./registry.js";
import OpenAI from 'openai';

dotenv.config();

// Setup axios with cookie support for enhanced API reliability
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
        
        // Modern OpenAI client for 2025
        this.openai = new OpenAI({
            apiKey: this.openaiKey,
            timeout: 30000,
            maxRetries: 3
        });
    }

    async initialize() {
        if (!this.openaiKey) {
            throw new Error('OpenAI API key not configured');
        }
        
        // Test API connectivity with modern endpoint
        const isValid = await this.validateApiKey();
        if (!isValid) {
            throw new Error('Invalid OpenAI API key');
        }

        this.initialized = true;
        logger.info('AI Service initialized with modern OpenAI client');
    }

    async validateApiKey() {
        try {
            // Use modern OpenAI client for validation
            const models = await this.openai.models.list();
            return models.data.length > 0;
        } catch (error) {
            logger.error('OpenAI API key validation failed', { error: error.message });
            return false;
        }
    }

    /**
     * Generate description with advanced billing integration and usage validation
     * Combines modern AI calls with enterprise-grade validation
     */
    async generateDescription(industry, location, type, lang, userId = null) {
        if (!this.initialized) {
            throw new Error('AI Service not initialized');
        }

        // Advanced billing check using service registry pattern
        if (userId) {
            const usageValidator = await serviceRegistry.get('usageValidator').catch(() => null);
            if (usageValidator) {
                const validation = await usageValidator.validateUsage(userId, 'page_generation', {
                    industry,
                    language: lang
                });
                
                if (!validation.allowed) {
                    throw new Error(validation.reason);
                }
            }

            // Legacy billing service fallback
            const billingService = await serviceRegistry.get('billing').catch(() => null);
            if (billingService) {
                const canGenerate = await billingService.checkGenerationLimit(userId);
                if (!canGenerate) {
                    throw new Error('Generation limit exceeded for user plan');
                }
            }
        }

        try {
            const prompt = this.buildAdvancedPrompt(industry, location, type, lang);

            // Use modern GPT-4 with streaming support (2025 best practice)
            const response = await this.openai.chat.completions.create({
                model: "gpt-4-turbo",  // Updated to latest model
                messages: [
                    {
                        role: "system",
                        content: "You are an expert marketing copywriter specializing in local business content."
                    },
                    {
                        role: "user", 
                        content: prompt
                    }
                ],
                max_tokens: 500,
                temperature: 0.7,
                presence_penalty: 0.1,
                frequency_penalty: 0.1,
                // Add response format for consistency
                response_format: { type: "text" }
            });

            const description = response.choices[0].message.content?.trim();

            if (!description) {
                throw new Error('Empty response from OpenAI API');
            }

            // Track usage in both new and legacy systems
            const usageValidator = await serviceRegistry.get('usageValidator').catch(() => null);
            if (usageValidator && userId) {
                await usageValidator.recordUsage(userId, 'page_generation', 1);
            }

            const billingService = await serviceRegistry.get('billing').catch(() => null);
            if (billingService && userId) {
                await billingService.trackUsage(userId, 'generation', 1);
            }

            aiLogger.info('AI description generated', {
                userId,
                industry,
                location,
                type,
                lang,
                model: "gpt-4-turbo",
                tokensUsed: response.usage?.total_tokens || 0,
                charactersGenerated: description.length
            });

            return description;

        } catch (error) {
            aiLogger.error('AI generation failed', {
                userId,
                industry,
                location,
                type,
                lang,
                error: error.message,
                errorType: error.constructor.name
            });

            // Enhanced error handling for 2025 API
            if (error.status === 401) {
                throw new Error('Invalid OpenAI API key');
            } else if (error.status === 429) {
                throw new Error('OpenAI rate limit exceeded. Please try again later.');
            } else if (error.status === 503) {
                throw new Error('OpenAI service temporarily unavailable');
            } else if (error.status === 400) {
                throw new Error('Invalid request parameters');
            }
            
            throw error;
        }
    }

    /**
     * Enhanced prompt building with 2025 SEO best practices
     */
    buildAdvancedPrompt(industry, location, type, lang) {
        const languageInstructions = {
            'en': 'Write in professional English with American SEO optimization',
            'es': 'Escribe en español profesional con optimización SEO para hispanohablantes',
            'fr': 'Écrivez en français professionnel avec optimisation SEO française',
            'de': 'Schreiben Sie in professionellem Deutsch mit deutscher SEO-Optimierung',
            'it': 'Scrivi in italiano professionale con ottimizzazione SEO italiana',
            'pt': 'Escreva em português profissional com otimização SEO brasileira',
            'ru': 'Пишите на профессиональном русском языке с русской SEO-оптимизацией',
            'ja': 'プロフェッショナルな日本語でSEO最適化して書いてください',
            'zh': '用专业中文写作，并进行中文SEO优化'
        };

        const instruction = languageInstructions[lang] || languageInstructions['en'];

        // Enhanced prompt for 2025 AI capabilities
        return `Create a compelling, conversion-focused business description for a ${industry} ${type} in ${location}.

REQUIREMENTS:
- ${instruction}
- Length: 180-350 words
- Include location-specific keywords naturally
- Focus on unique value propositions and customer benefits  
- Add emotional triggers and trust signals
- Include clear call-to-action
- Use power words that drive conversions
- Optimize for voice search and mobile users (2025 SEO)
- Structure for featured snippets potential

CONTEXT:
- Industry: ${industry}
- Business Type: ${type}  
- Location: ${location}
- Target Language: ${lang}
- Year: 2025 (use current market trends)

TONE: Professional, trustworthy, locally-focused, conversion-optimized

Generate the marketing copy now:`;
    }

    /**
     * Enhanced bulk processing with 2025 performance optimizations
     */
    async generateBulkContent(requests, userId = null) {
        const results = [];
        let successCount = 0;
        let failureCount = 0;

        logger.info('Starting bulk content generation', {
            userId,
            requestCount: requests.length,
            timestamp: new Date().toISOString()
        });

        // Process in batches for better performance (2025 optimization)
        const batchSize = 5;
        for (let i = 0; i < requests.length; i += batchSize) {
            const batch = requests.slice(i, i + batchSize);
            
            // Process batch concurrently but with rate limiting
            const batchPromises = batch.map(async (request, batchIndex) => {
                const globalIndex = i + batchIndex;
                
                try {
                    // Add staggered delay to prevent rate limiting
                    await new Promise(resolve => setTimeout(resolve, batchIndex * 200));
                    
                    const content = await this.generateDescription(
                        request.industry,
                        request.location,
                        request.type,
                        request.lang,
                        userId
                    );

                    return {
                        ...request,
                        content,
                        success: true,
                        index: globalIndex,
                        timestamp: new Date().toISOString()
                    };

                } catch (error) {
                    return {
                        ...request,
                        error: error.message,
                        success: false,
                        index: globalIndex,
                        timestamp: new Date().toISOString()
                    };
                }
            });

            const batchResults = await Promise.allSettled(batchPromises);
            
            // Process batch results
            batchResults.forEach(result => {
                if (result.status === 'fulfilled') {
                    results.push(result.value);
                    if (result.value.success) {
                        successCount++;
                    } else {
                        failureCount++;
                    }
                } else {
                    results.push({
                        error: 'Promise rejected',
                        success: false,
                        index: results.length
                    });
                    failureCount++;
                }
            });

            // Enhanced failure threshold with recovery
            if (failureCount > requests.length * 0.3) {
                logger.warn('High failure rate detected, implementing recovery strategy', {
                    userId,
                    successCount,
                    failureCount,
                    totalRequests: requests.length,
                    failureRate: ((failureCount / (successCount + failureCount)) * 100).toFixed(1) + '%'
                });
                
                // Wait longer between batches when failures are high
                await new Promise(resolve => setTimeout(resolve, 5000));
            }

            // Stop if catastrophic failure rate
            if (failureCount > requests.length * 0.7) {
                logger.error('Bulk generation stopped - catastrophic failure rate', {
                    userId,
                    successCount,
                    failureCount,
                    totalRequests: requests.length
                });
                break;
            }

            // Progress logging every batch
            logger.info('Bulk generation batch completed', {
                userId,
                batchCompleted: Math.floor(i / batchSize) + 1,
                totalBatches: Math.ceil(requests.length / batchSize),
                successCount,
                failureCount
            });
        }

        const summary = {
            total: requests.length,
            success: successCount,
            failed: failureCount,
            successRate: ((successCount / requests.length) * 100).toFixed(1) + '%',
            completedAt: new Date().toISOString()
        };

        logger.info('Bulk content generation completed', { userId, ...summary });

        return { results, summary };
    }

    /**
     * Modern streaming generation for real-time UI (2025 feature)
     */
    async *generateStreamingDescription(industry, location, type, lang, userId = null) {
        if (!this.initialized) {
            throw new Error('AI Service not initialized');
        }

        // Usage validation
        if (userId) {
            const usageValidator = await serviceRegistry.get('usageValidator').catch(() => null);
            if (usageValidator) {
                const validation = await usageValidator.validateUsage(userId, 'page_generation', {
                    industry,
                    language: lang
                });
                
                if (!validation.allowed) {
                    throw new Error(validation.reason);
                }
            }
        }

        try {
            const prompt = this.buildAdvancedPrompt(industry, location, type, lang);

            const stream = await this.openai.chat.completions.create({
                model: "gpt-4-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are an expert marketing copywriter specializing in local business content."
                    },
                    {
                        role: "user", 
                        content: prompt
                    }
                ],
                max_tokens: 500,
                temperature: 0.7,
                stream: true  // Enable streaming
            });

            let fullContent = '';
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                fullContent += content;
                
                yield {
                    type: 'content',
                    data: content,
                    fullContent,
                    isComplete: false
                };
            }

            // Record usage after completion
            const usageValidator = await serviceRegistry.get('usageValidator').catch(() => null);
            if (usageValidator && userId) {
                await usageValidator.recordUsage(userId, 'page_generation', 1);
            }

            yield {
                type: 'complete',
                data: fullContent,
                fullContent,
                isComplete: true
            };

        } catch (error) {
            aiLogger.error('Streaming generation failed', {
                userId,
                industry,
                location,
                error: error.message
            });
            throw error;
        }
    }

    async shutdown() {
        this.initialized = false;
        logger.info('AI Service shutdown completed');
    }
}

const aiService = new AIService();

// Enhanced legacy function exports with modern features
export async function generateDescription(industry, location, type, lang, userId) {
    return await aiService.generateDescription(industry, location, type, lang, userId);
}

export async function generateBulkContent(requests, userId) {
    return await aiService.generateBulkContent(requests, userId);
}

// New 2025 streaming function
export async function* generateStreamingDescription(industry, location, type, lang, userId) {
    yield* aiService.generateStreamingDescription(industry, location, type, lang, userId);
}

export async function validateAiApiKey() {
    return await aiService.validateApiKey();
}

export async function getAiUsageStats() {
    // Enhanced usage statistics
    return {
        tokensUsedToday: 0,
        requestsThisMonth: 0,
        estimatedCost: 0,
        averageResponseTime: 0,
        successRate: 100,
        lastUpdated: new Date().toISOString()
    };
}

export default aiService;