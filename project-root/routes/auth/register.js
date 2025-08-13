import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { body } from "express-validator";
import { handleValidationErrors } from "../../middleware/validation.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { sendVerificationEmail } from "../../services/email.js";
import User from "../../models/User.js";
import Plan from "../../models/Plan.js";

const router = express.Router();

const validateRegister = [
    body('email').isEmail().normalizeEmail(),
    body('username').isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_]+$/),
    body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),
    body('confirmPassword').custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error('Passwords do not match');
        }
        return true;
    }),
    handleValidationErrors
];

// GET register page
router.get("/register", async (req, res) => {
    const plans = await Plan.find({ active: true });
    res.render("auth/register", { 
        title: "Register", 
        siteName: process.env.SITE_NAME,
        plans
    });
});

// POST register
router.post("/register",
    validateRegister,
    asyncHandler(async (req, res) => {
        const { email, username, password, planId } = req.body;
        
        // Check if user exists
        const existingUser = await User.findOne({ 
            $or: [{ email }, { username }] 
        });
        
        if (existingUser) {
            const plans = await Plan.find({ active: true });
            return res.status(400).render("auth/register", {
                title: "Register",
                siteName: process.env.SITE_NAME,
                plans,
                error: "User with this email or username already exists"
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);
        
        // Generate email verification token
        const emailVerificationToken = crypto.randomBytes(32).toString('hex');
        
        // Create user
        const user = await User.create({
            email,
            username,
            password: hashedPassword,
            planId: planId || null,
            role: 'client',
            emailVerificationToken,
            emailVerified: false
        });

        // Send verification email
        await sendVerificationEmail(user.email, emailVerificationToken);

        res.render("auth/verify-email", {
            title: "Verify Email",
            siteName: process.env.SITE_NAME,
            email: user.email
        });
    })
);

export default router;
