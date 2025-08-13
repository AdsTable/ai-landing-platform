import express from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../middleware/errorHandler.js";

const router = express.Router();

router.get("/social", 
    requireAuth, 
    requireRole("admin"), 
    asyncHandler(async (req, res) => {
        // Mock social platform connections - replace with real data
        const platforms = [
            {
                name: 'Facebook',
                connected: false,
                lastPost: null,
                followers: 0
            },
            {
                name: 'Twitter', 
                connected: false,
                lastPost: null,
                followers: 0
            },
            {
                name: 'LinkedIn',
                connected: false,
                lastPost: null,
                followers: 0
            }
        ];

        const recentPosts = [];

        res.render("admin/social", {
            title: "Social Media",
            siteName: process.env.SITE_NAME || "AI Landing Platform",
            user: req.user,
            currentPage: 'social',
            platforms,
            recentPosts,
            VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY
        });
    })
);

export default router;
