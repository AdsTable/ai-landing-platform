import fetch from 'node-fetch';
import settings from '../config/settings.js';

/**
 * Send lead data to CRM system
 */
export async function sendLeadToCRM(name, phone, message) {
    if (!settings.crm.enabled) return;
    if (settings.crm.provider === "bitrix24") {
        await fetch(`${settings.crm.webhook}crm.lead.add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                fields: {
                    TITLE: `Lead from site - ${name}`,
                    NAME: name,
                    PHONE: [{ VALUE: phone }],
                    COMMENTS: message
                }
            })
        });
    }
}
