import nodemailer from "nodemailer";
import { logger } from "./logger.js";

// Create transporter
const transporter = nodemailer.createTransporter({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// Email templates
const templates = {
    verification: (token) => ({
        subject: "Verify Your Email Address",
        html: `
            <h2>Verify Your Account</h2>
            <p>Please click the link below to verify your email address:</p>
            <a href="${process.env.APP_URL}/auth/verify-email/${token}">Verify Email</a>
            <p>This link will expire in 24 hours.</p>
        `
    }),
    
    forgot_password: (resetUrl) => ({
        subject: "Password Reset Request",
        html: `
            <h2>Password Reset</h2>
            <p>You requested a password reset. Click the link below:</p>
            <a href="${resetUrl}">Reset Your Password</a>
            <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>
        `
    }),
    
    password_changed: (username) => ({
        subject: "Password Changed Successfully", 
        html: `
            <h2>Password Updated</h2>
            <p>Hi ${username},</p>
            <p>Your password has been successfully changed.</p>
            <p>If you didn't make this change, please contact support immediately.</p>
        `
    }),
    
    passwordReset: (token) => ({
        subject: "Reset Your Password",
        html: `
            <h2>Reset Your Password</h2>
            <p>You requested a password reset. Click the link below:</p>
            <a href="${process.env.APP_URL}/auth/reset-password/${token}">Reset Password</a>
            <p>This link will expire in 1 hour.</p>
        `
    }),

    welcome: (username) => ({
        subject: "Welcome to AI Landing Platform!",
        html: `
            <h2>Welcome ${username}!</h2>
            <p>Your account has been successfully created.</p>
            <p>You can now start generating AI-powered landing pages.</p>
        `
    }),
	
	subscription_canceled: (username) => ({
        subject: "Subscription Canceled",
        html: `
            <h2>Subscription Canceled</h2>
            <p>Hi ${username},</p>
            <p>Your subscription has been canceled and you've been moved to the free plan.</p>
            <p>You can resubscribe at any time from your dashboard.</p>
        `
    }),
    
    payment_succeeded: (username, amount, invoiceUrl) => ({
        subject: "Payment Confirmation",
        html: `
            <h2>Payment Received</h2>
            <p>Hi ${username},</p>
            <p>We've successfully processed your payment of $${amount}.</p>
            <p><a href="${invoiceUrl}">View Invoice</a></p>
        `
    }),
    
    payment_failed: (username, amount, invoiceUrl) => ({
        subject: "Payment Failed",
        html: `
            <h2>Payment Failed</h2>
            <p>Hi ${username},</p>
            <p>We couldn't process your payment of $${amount}.</p>
            <p>Please update your payment method to continue your subscription.</p>
            <p><a href="${invoiceUrl}">Update Payment Method</a></p>
        `
    })
};

export async function sendVerificationEmail(email, token) {
    const template = templates.verification(token);
    
    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM,
            to: email,
            subject: template.subject,
            html: template.html
        });
        
        logger.info('Verification email sent', { email });
    } catch (error) {
        logger.error('Failed to send verification email', { email, error: error.message });
        throw error;
    }
}

export async function sendPasswordResetEmail(email, token) {
    const template = templates.passwordReset(token);
    
    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM,
            to: email,
            subject: template.subject,
            html: template.html
        });
        
        logger.info('Password reset email sent', { email });
    } catch (error) {
        logger.error('Failed to send password reset email', { email, error: error.message });
        throw error;
    }
}

export async function sendWelcomeEmail(email, username) {
    const template = templates.welcome(username);
    
    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM,
            to: email,
            subject: template.subject,
            html: template.html
        });
        
        logger.info('Welcome email sent', { email, username });
    } catch (error) {
        logger.error('Failed to send welcome email', { email, error: error.message });
    }
}
