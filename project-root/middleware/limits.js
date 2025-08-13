/**
 * Middleware to check the user's plan limits before allowing page generation.
 */
export function checkGenerationLimit(req, res, next) {
    if (!req.user || !req.user.planId) {
        return res.status(403).send('No plan assigned.');
    }
    const planLimits = req.user.planId.limits;
    if (req.user.generatedThisMonth >= planLimits.pagesPerMonth) {
        return res.status(403).send('Monthly generation limit exceeded. Please upgrade your plan.');
    }
    next();
}
