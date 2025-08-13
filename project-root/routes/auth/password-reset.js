import express from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { body, param } from "express-validator";
import { handleValidationErrors } from "../../middleware/validation.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { sendPasswordResetEmail } from "../../services/email.js";
import User from "../../models/User.js";

const router = express.Router();

// Validation
const validateResetRequest = [
    body('email').isEmail().normalizeEmail(),
    handleValidationErrors
];

const validateResetForm = [
    body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),
    body('confirmPassword').custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error('Passwords do not match');
        }
        return true;
    }),
    handleValidationErrors
];

// GET - Request password reset form
router.get("/forgot-password", (req, res) => {
    res.render("auth/forgot-password", {
        title: "Forgot Password",
        siteName: process.env.SITE_NAME
    });
});

// POST - Send password reset email
router.post("/forgot-password", 
    validateResetRequest,
    asyncHandler(async (req, res) => {
        const { email } = req.body;
        const user = await User.findOne({ email });
        
        if (!user) {
            // Don't reveal if user exists
            return res.render("auth/reset-sent", {
                title: "Reset Email Sent",
                siteName: process.env.SITE_NAME,
                email
            });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date(Date.now() + 3600000); // 1 hour

        user.passwordResetToken = resetToken;
        user.passwordResetExpires = resetExpires;
        await user.save();

        // Send reset email
        await sendPasswordResetEmail(email, resetToken);

        res.render("auth/reset-sent", {
            title: "Reset Email Sent",
            siteName: process.env.SITE_NAME,
            email
        });
    })
);

// GET - Reset password form
router.get("/reset-password/:token", asyncHandler(async (req, res) => {
    const { token } = req.params;
    
    const user = await User.findOne({
        passwordResetToken: token,
        passwordResetExpires: { $gt: new Date() }
    });

    if (!user) {
        return res.render("auth/reset-expired", {
            title: "Reset Link Expired",
            siteName: process.env.SITE_NAME
        });
    }

    res.render("auth/reset-password", {
        title: "Reset Password",
        siteName: process.env.SITE_NAME,
        token
    });
}));

// POST - Reset password
router.post("/reset-password/:token",
    validateResetForm,
    asyncHandler(async (req, res) => {
        const { token } = req.params;
        const { password } = req.body;

        const user = await User.findOne({
            passwordResetToken: token,
            passwordResetExpires: { $gt: new Date() }
        }).select('+password');

        if (!user) {
            return res.render("auth/reset-expired", {
                title: "Reset Link Expired",
                siteName: process.env.SITE_NAME
            });
        }

        // Update password
        user.password = await bcrypt.hash(password, 12);
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        res.render("auth/reset-success", {
            title: "Password Reset",
            siteName: process.env.SITE_NAME
        });
    })
);

export default router;
