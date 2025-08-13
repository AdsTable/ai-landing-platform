// Predefined tenants for initial setup/demo
export default [
    {
        name: "Demo Real Estate",
        domain: "realestate.localhost",
        logoUrl: "/img/demo-re-logo.png",
        primaryColor: "#007bff",
        allowedIndustries: ["real_estate"],
        allowedLanguages: ["en", "es"],
        planName: "Pro" // will be matched with Plan model in DB
    },
    {
        name: "Demo Tourism",
        domain: "tourism.localhost",
        logoUrl: "/img/demo-tour-logo.png",
        primaryColor: "#ff6600",
        allowedIndustries: ["tourism"],
        allowedLanguages: ["en", "es"],
        planName: "Enterprise"
    }
];
