export function requireApiAuth(req, res, next) {
    const token = req.headers['x-api-key'];
    if (token !== process.env.API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
}
