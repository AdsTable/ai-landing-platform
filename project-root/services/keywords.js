import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

/**
 * Generate SEO keyword list from given text/topic using AI
 */
export async function suggestKeywordsFromText(text) {
    const prompt = `From the following text, extract and suggest 10 optimal SEO keywords as a comma-separated list:
    ---
    ${text}
    ---`;

    const res = await fetch("https://api.openai.com/v1/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "gpt-3.5-turbo-instruct",
            prompt,
            max_tokens: 100
        })
    });

    const data = await res.json();
    return data.choices?.[0]?.text?.split(",").map(k => k.trim()).filter(Boolean) || [];
}
