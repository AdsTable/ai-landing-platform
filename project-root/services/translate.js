import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

/**
 * Translate text to target language preserving marketing style and SEO keywords
 * @param {string} text - Source text for translation
 * @param {string} targetLang - ISO code of the target language (e.g. "en", "es", "fr")
 * @returns {Promise<string>} - Translated text
 */
export async function translateText(text, targetLang) {
    const prompt = `Translate the following text to ${targetLang} preserving marketing tone and SEO keywords:
    ---
    ${text}
    ---
    Translation:`;

    const response = await fetch("https://api.openai.com/v1/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "gpt-3.5-turbo-instruct",
            prompt,
            max_tokens: 500,
            temperature: 0.3
        })
    });

    const data = await response.json();
    return data.choices?.[0]?.text?.trim() || text;
}
