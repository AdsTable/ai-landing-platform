import express from "express";
import bcrypt from "bcryptjs";
import { body } from "express-validator";
import { handleValidationErrors } from "../../middleware/validation.js";
import { authLimiter } from "../../middleware/security.js";
import { securityMonitor } from "../../middleware/monitoring.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import User from "../../models/User.js";

const router = express.Router();

const validateLogin = [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 1 }),
    handleValidationErrors
];

// GET login page
router.get("/login", (req, res) => {
    if (req.user) {
        return res.redirect('/admin');
    }
    res.render("auth/login", { 
        title: "Login", 
        siteName: process.env.SITE_NAME 
    });
});

// POST login
router.post("/login", 
    authLimiter,
    validateLogin,
    asyncHandler(async (req, res) => {
        const { email, password } = req.body;
        
        const user = await User.findOne({ email }).select('+password');
        
        if (!user || !await bcrypt.compare(password, user.password)) {
            securityMonitor.logFailedLogin(req.ip, email);
            return res.status(401).render("auth/login", {
                title: "Login",
                siteName: process.env.SITE_NAME,
                error: "Invalid credentials"
            });
        }

        // Check if email is verified
        if (!user.emailVerified) {
            return res.status(401).render("auth/login", {
                title: "Login",
                siteName: process.env.SITE_NAME,
                error: "Please verify your email first"
            });
        }

        req.session.userId = user._id;
        
        // Redirect based on role
        const redirectUrl = user.role === 'admin' ? '/admin' : '/tenant';
        res.redirect(redirectUrl);
    })
);

// POST logout
router.post("/logout", (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

export default router;
