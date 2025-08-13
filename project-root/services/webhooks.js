import fetch from 'node-fetch';

/**
 * Trigger external webhook with payload
 */
export async function triggerWebhook(url, payload) {
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        return await res.text();
    } catch (e) {
        console.error("Webhook error:", e);
    }
}
