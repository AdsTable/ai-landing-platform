import mongoose from "mongoose";

const invoiceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    stripeInvoiceId: { type: String, required: true, unique: true },
    amount: { type: Number, required: true }, // in cents
    currency: { type: String, default: 'usd' },
    status: { 
        type: String, 
        enum: ['draft', 'open', 'paid', 'void', 'uncollectible'],
        required: true 
    },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    hostedInvoiceUrl: { type: String },
    invoicePdf: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed }
}, {
    timestamps: true
});

invoiceSchema.index({ userId: 1, createdAt: -1 });
invoiceSchema.index({ stripeInvoiceId: 1 });

export default mongoose.model('Invoice', invoiceSchema);
