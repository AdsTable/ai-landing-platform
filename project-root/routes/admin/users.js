import express from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { validatePagination } from "../../middleware/validation.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import User from "../../models/User.js";
import Plan from "../../models/Plan.js";

const router = express.Router();

router.get("/users", 
    requireAuth, 
    requireRole("admin"),
    validatePagination,
    asyncHandler(async (req, res) => {
        const { page = 1, limit = 20, role, search } = req.query;

        // Build filter
        const filter = {};
        if (role && role !== 'all') filter.role = role;
        if (search) {
            filter.$or = [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        // Get users with pagination
        const users = await User.find(filter)
            .populate('planId')
            .populate('tenantId')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .select('-password') // Don't send passwords
            .sort({ createdAt: -1 });

        const totalUsers = await User.countDocuments(filter);
        const plans = await Plan.find();

        res.render("admin/users", {
            title: "User Management",
            siteName: process.env.SITE_NAME || "AI Landing Platform",
            user: req.user,
            currentPage: 'users',
            users,
            plans,
            roles: ['admin', 'editor', 'marketer', 'client'],
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalUsers,
                pages: Math.ceil(totalUsers / limit)
            },
            filters: { role, search },
            VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY
        });
    })
);

export default router;
