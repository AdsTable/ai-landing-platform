import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { logger } from "../logger.js";
import User from "../../models/User.js";
import Plan from "../../models/Plan.js";
import Tenant from "../../models/Tenant.js";
import settings from "../../config/settings.js";

class SeedService {
    constructor() {
        this.seeded = false;
    }

    /**
     * Check if database is already seeded
     */
    async isSeeded() {
        try {
            const userCount = await User.countDocuments();
            const planCount = await Plan.countDocuments();
            
            return userCount > 0 && planCount > 0;
        } catch (error) {
            logger.error('Failed to check seed status', { error: error.message });
            return false;
        }
    }

    /**
     * Seed plans first (dependencies)
     */
    async seedPlans() {
        try {
            const existingPlans = await Plan.countDocuments();
            if (existingPlans > 0) {
                logger.info('Plans already exist, skipping seed');
                return await Plan.find();
            }

            const plansData = [
                {
                    name: "Free",
                    price: 0,
                    limits: {
                        monthlyGenerations: 5,
                        monthlyApiCalls: 100,
                        monthlyTranslations: 50
                    },
                    features: [
                        "5 AI Generated Pages",
                        "Basic Templates",
                        "Email Support",
                        "1 Language"
                    ],
                    active: true,
                    stripePriceId: null, // Free plan doesn't need Stripe
                    stripeProductId: null
                },
                {
                    name: "Pro",
                    price: 29,
                    limits: {
                        monthlyGenerations: 100,
                        monthlyApiCalls: 10000,
                        monthlyTranslations: 1000
                    },
                    features: [
                        "100 AI Generated Pages",
                        "Premium Templates", 
                        "Priority Support",
                        "All Languages",
                        "Custom Branding",
                        "API Access"
                    ],
                    overageRates: {
                        pages: 1.0, // $1 per extra page
                        apiCalls: 0.01, // $0.01 per 100 API calls
                        translations: 0.05 // $0.05 per translation
                    },
                    active: true,
                    stripePriceId: process.env.STRIPE_PRO_PRICE_ID,
                    stripeProductId: process.env.STRIPE_PRO_PRODUCT_ID
                },
                {
                    name: "Enterprise",
                    price: 99,
                    limits: {
                        monthlyGenerations: -1, // unlimited
                        monthlyApiCalls: -1,
                        monthlyTranslations: -1
                    },
                    features: [
                        "Unlimited Everything",
                        "White Label Solution",
                        "Dedicated API",
                        "Custom Integrations",
                        "24/7 Support",
                        "SLA Guarantee",
                        "Custom Development"
                    ],
                    active: true,
                    stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
                    stripeProductId: process.env.STRIPE_ENTERPRISE_PRODUCT_ID
                }
            ];

            const plans = await Plan.insertMany(plansData);
            logger.info('Plans seeded successfully', { 
                count: plans.length,
                plans: plans.map(p => ({ name: p.name, price: p.price }))
            });

            return plans;

        } catch (error) {
            logger.error('Plans seeding failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Seed tenants
     */
    async seedTenants() {
        try {
            const existingTenants = await Tenant.countDocuments();
            if (existingTenants > 0) {
                logger.info('Tenants already exist, skipping seed');
                return await Tenant.find();
            }

            const tenantsData = [
                {
                    name: "Demo Real Estate",
                    domain: "demo-realestate.example.com",
                    logoUrl: "/images/logos/realestate-logo.png",
                    primaryColor: "#2E7D32",
                    secondaryColor: "#4CAF50",
                    industry: "real-estate",
                    active: true
                },
                {
                    name: "Demo Auto Sales", 
                    domain: "demo-auto.example.com",
                    logoUrl: "/images/logos/auto-logo.png",
                    primaryColor: "#1976D2",
                    secondaryColor: "#2196F3",
                    industry: "automotive",
                    active: true
                },
                {
                    name: "Demo Restaurant",
                    domain: "demo-restaurant.example.com", 
                    logoUrl: "/images/logos/restaurant-logo.png",
                    primaryColor: "#D32F2F",
                    secondaryColor: "#F44336",
                    industry: "restaurant",
                    active: true
                }
            ];

            const tenants = await Tenant.insertMany(tenantsData);
            logger.info('Tenants seeded successfully', { 
                count: tenants.length,
                tenants: tenants.map(t => ({ name: t.name, industry: t.industry }))
            });

            return tenants;

        } catch (error) {
            logger.error('Tenants seeding failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Seed users
     */
    async seedUsers(plans, tenants) {
        try {
            const existingUsers = await User.countDocuments();
            if (existingUsers > 0) {
                logger.info('Users already exist, skipping seed');
                return await User.find();
            }

            const freePlan = plans.find(p => p.price === 0);
            const proPlan = plans.find(p => p.price === 29);
            const enterprisePlan = plans.find(p => p.price === 99);
            const demoTenant = tenants[0];

            // Hash passwords
            const adminPassword = await bcrypt.hash(process.env.SEED_ADMIN_PASS || 'admin123!', 12);
            const userPassword = await bcrypt.hash(process.env.SEED_USER_PASS || 'user123!', 12);

            const usersData = [
                {
                    username: "admin",
                    email: process.env.SEED_ADMIN_EMAIL || "admin@example.com",
                    password: adminPassword,
                    role: "admin",
                    emailVerified: true,
                    planId: enterprisePlan._id,
                    tenantId: null, // Admin not tied to specific tenant
                    isActive: true
                },
                {
                    username: "demo_client",
                    email: process.env.SEED_CLIENT_EMAIL || "client@example.com", 
                    password: userPassword,
                    role: "client",
                    emailVerified: true,
                    planId: proPlan._id,
                    tenantId: demoTenant._id,
                    isActive: true
                },
                {
                    username: "demo_editor",
                    email: process.env.SEED_EDITOR_EMAIL || "editor@example.com",
                    password: userPassword,
                    role: "editor", 
                    emailVerified: true,
                    planId: freePlan._id,
                    tenantId: demoTenant._id,
                    isActive: true
                },
                {
                    username: "demo_marketer",
                    email: process.env.SEED_MARKETER_EMAIL || "marketer@example.com",
                    password: userPassword,
                    role: "marketer",
                    emailVerified: true,
                    planId: proPlan._id,
                    tenantId: demoTenant._id,
                    isActive: true
                }
            ];

            const users = await User.insertMany(usersData);
            logger.info('Users seeded successfully', { 
                count: users.length,
                users: users.map(u => ({ username: u.username, role: u.role, plan: plans.find(p => p._id.equals(u.planId))?.name }))
            });

            return users;

        } catch (error) {
            logger.error('Users seeding failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Main seed function
     */
    async seedDatabase(force = false) {
        try {
            if (!force && await this.isSeeded()) {
                logger.info('Database already seeded, skipping');
                return {
                    seeded: false,
                    reason: 'already_seeded'
                };
            }

            logger.info('Starting database seeding...');

            // Seed in correct order (dependencies first)
            const plans = await this.seedPlans();
            const tenants = await this.seedTenants(); 
            const users = await this.seedUsers(plans, tenants);

            this.seeded = true;
            
            logger.info('Database seeding completed successfully', {
                plans: plans.length,
                tenants: tenants.length,
                users: users.length
            });

            return {
                seeded: true,
                data: {
                    plans: plans.length,
                    tenants: tenants.length,
                    users: users.length
                }
            };

        } catch (error) {
            logger.error('Database seeding failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Clear all seeded data (for testing)
     */
    async clearSeedData() {
        try {
            logger.warn('Clearing all seed data...');

            await User.deleteMany({});
            await Plan.deleteMany({});
            await Tenant.deleteMany({});
            
            logger.warn('All seed data cleared');

            return true;

        } catch (error) {
            logger.error('Failed to clear seed data', { error: error.message });
            throw error;
        }
    }
}

export const seedService = new SeedService();
export default seedService;

// Legacy export for backward compatibility
export async function seedDatabase(force = false) {
    return await seedService.seedDatabase(force);
}
