// Usage charts and statistics for tenant dashboard
function loadUsageCharts() {
    // Mock data - replace with real API calls
    const pageGeneration = { used: 12, limit: 20 };
    const apiCalls = { used: 300, limit: 1000 };
    
    updateUsageBar('pages', pageGeneration.used, pageGeneration.limit);
    updateUsageBar('api', apiCalls.used, apiCalls.limit);
}

function updateUsageBar(type, used, limit) {
    const percentage = (used / limit) * 100;
    const bar = document.querySelector(`[data-usage="${type}"] .usage-fill`);
    if (bar) {
        bar.style.width = `${percentage}%`;
    }
}

// Load on page ready
document.addEventListener('DOMContentLoaded', loadUsageCharts);
