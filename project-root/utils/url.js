/**
 * URL generation utilities
 */

export function getAppUrl() {
    return process.env.APP_URL || 'http://localhost:3000';
}

export function getApiUrl() {
    return `${getAppUrl()}/api/v1`;
}

export function buildUrl(path) {
    const baseUrl = getAppUrl();
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${cleanPath}`;
}

export function buildApiUrl(endpoint) {
    const apiUrl = getApiUrl();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${apiUrl}${cleanEndpoint}`;
}

// For email templates
export function buildAuthUrl(action, token) {
    return buildUrl(`/auth/${action}/${token}`);
}

// For webhook callbacks
export function buildWebhookUrl(service) {
    return buildUrl(`/webhooks/${service}`);
}

// For testing
export function getTestBaseUrl() {
    return process.env.TEST_BASE_URL || getAppUrl();
}
