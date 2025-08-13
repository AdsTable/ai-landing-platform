import express from "express";
import { requireApiAuth } from "../../middleware/apiAuth.js";
import { generateDescription } from "../../services/ai.js";
import { generateImage } from "../../services/images.js";
import { saveToCache, getAllCacheKeys, getFromCache } from "../../services/cache.js";
import settings from "../../config/settings.js";

const router = express.Router();

router.use(requireApiAuth);

// List all generated pages
router.get("/pages", (req, res) => {
    res.json(getAllCacheKeys());
});

// Get single page data
router.get("/pages/:key", (req, res) => {
    res.json(getFromCache(req.params.key) || {});
});

// Create new page
router.post("/pages", async (req, res) => {
    const { industry, location, type, lang } = req.body;
    const cacheKey = `${industry}-${lang}-${location}-${type}`;
    const seoText = await generateDescription(industry, location, type, lang);
    const imageUrl = settings.modules.aiImages
        ? await generateImage(`${industry} ${type} in ${location}, ${lang}`)
        : null;

    saveToCache(cacheKey, { seoText, imageUrl });
    res.json({ key: cacheKey, seoText, imageUrl });
});

export default router;
