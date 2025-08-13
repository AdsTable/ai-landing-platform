import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

/**
 * Analyze traffic data and suggest improvements
 */
export async function analyzeTraffic(pagesData) {
    const prompt = `Analyze the following page performance data and suggest improvements to increase engagement:
    ${JSON.stringify(pagesData)}`;

    const res = await fetch("https://api.openai.com/v1/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "gpt-3.5-turbo-instruct",
            prompt,
            max_tokens: 250
        })
    });

    const data = await res.json();
    return data.choices?.[0]?.text?.trim() || "";
}
