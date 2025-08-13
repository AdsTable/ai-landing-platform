export default {
    siteName: "AI Landing SaaS",
    baseUrl: process.env.BASE_URL || "http://localhost:3000",
    defaultLanguage: "en",
    industries: [
        {
            key: "real_estate",
            name: { en: "Real Estate", es: "Bienes Raíces" },
            types: {
                en: ["Apartment", "House", "Villa"],
                es: ["Apartamento", "Casa", "Villa"]
            }
        },
        {
            key: "tourism",
            name: { en: "Tourism", es: "Turismo" },
            types: {
                en: ["City Tour", "Cruise", "Adventure Trip"],
                es: ["Tour Urbano", "Crucero", "Viaje de Aventura"]
            }
        }
    ],
    languages: [
        { code: "en", name: "English" },
        { code: "es", name: "Español" }
    ],
    modules: {
        reviews: true,
        map: true,
        form: true,
        ecommerce: true,
        aiImages: true,
        pwa: true
    },
    googleTrendsGeo: "GLOBAL",
    payment: {
        enabled: true,
        provider: "stripe",
        publicKey: process.env.STRIPE_PUBLIC
    },
    crm: {
        enabled: false
    }
};
