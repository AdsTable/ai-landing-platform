import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Generate image using OpenAI DALL·E API
 */
export async function generateImage(prompt) {
    const url = "https://api.openai.com/v1/images/generations";
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            prompt,
            n: 1,
            size: "1024x1024"
        })
    });
    const data = await response.json();
    return data.data?.[0]?.url || null;
}
