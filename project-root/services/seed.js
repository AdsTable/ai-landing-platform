import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Plan from "../models/Plan.js";
import Tenant from "../models/Tenant.js";
import { logger } from "./logger.js";

export async function seedDatabase() {
    try {
        logger.info('Starting database seed...');

        // Create default plans
        const plans = await Plan.insertMany([
            {
                name: "Free",
                price: 0,
                limits: {
                    monthlyGenerations: 5,
                    monthlyApiCalls: 100,
                    monthlyTranslations: 50
                },
                features: ["Basic AI Generation", "1 Language", "Email Support"]
            },
            {
                name: "Pro",
                price: 29,
                limits: {
                    monthlyGenerations: 100,
                    monthlyApiCalls: 10000,
                    monthlyTranslations: 1000
                },
                features: ["Advanced AI", "All Languages", "Priority Support", "Custom Branding"]
            },
            {
                name: "Enterprise",
                price: 99,
                limits: {
                    monthlyGenerations: -1, // unlimited
                    monthlyApiCalls: -1,
                    monthlyTranslations: -1
                },
                features: ["Unlimited Everything", "White Label", "API Access", "Dedicated Support"]
            }
        ]);

        // Create admin user
        const adminPassword = await bcrypt.hash('admin123!', 12);
        await User.create({
            username: "admin",
            email: "admin@example.com",
            password: adminPassword,
            role: "admin",
            emailVerified: true,
            planId: plans[2]._id // Enterprise plan
        });

        // Create demo tenant
        await Tenant.create({
            name: "Demo Company",
            domain: "demo.example.com",
            logoUrl: "/demo-logo.png",
            primaryColor: "#007bff",
            secondaryColor: "#6c757d"
        });

        logger.info('Database seed completed successfully');
        
    } catch (error) {
        logger.error('Database seed failed', { error: error.message });
        throw error;
    }
}
