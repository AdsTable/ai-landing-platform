import mongoose from "mongoose";

const TenantSchema = new mongoose.Schema({
    name: String,
    domain: String,
    logoUrl: String,
    primaryColor: String,
    allowedIndustries: [String],
    allowedLanguages: [String],
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' }
});

export default mongoose.model('Tenant', TenantSchema);
