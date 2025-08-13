import express from "express";
import { requireAuth } from "../../middleware/auth.js";
import { validatePagination } from "../../middleware/validation.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import Invoice from "../../models/Invoice.js";

const router = express.Router();

// GET /billing/invoices - List user's invoices
router.get("/invoices",
    requireAuth,
    validatePagination,
    asyncHandler(async (req, res) => {
        const { page = 1, limit = 10 } = req.query;
        
        const invoices = await Invoice.find({ userId: req.user._id })
            .populate('planId')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const totalInvoices = await Invoice.countDocuments({ userId: req.user._id });

        res.render("billing/invoices", {
            title: "Invoice History",
            siteName: process.env.SITE_NAME,
            user: req.user,
            invoices,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalInvoices,
                pages: Math.ceil(totalInvoices / limit)
            },
            VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY
        });
    })
);

// GET /billing/invoices/:id - View specific invoice
router.get("/invoices/:id",
    requireAuth,
    asyncHandler(async (req, res) => {
        const invoice = await Invoice.findOne({
            _id: req.params.id,
            userId: req.user._id
        }).populate('planId');

        if (!invoice) {
            return res.status(404).send('Invoice not found');
        }

        res.render("billing/invoice-detail", {
            title: `Invoice #${invoice._id}`,
            siteName: process.env.SITE_NAME,
            user: req.user,
            invoice,
            VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY
        });
    })
);

export default router;
