import mongoose from "mongoose";

const PlanSchema = new mongoose.Schema({
    name: String,
    price: Number,
    currency: String,
    limits: {
        pagesPerMonth: Number,
        industries: [String],
        languages: [String]
    },
	stripePriceId: { type: String }, // Stripe Price ID
	stripeProductId: { type: String }, // Stripe Product ID
	active: { type: Boolean, default: true }

});

export default mongoose.model('Plan', PlanSchema);
