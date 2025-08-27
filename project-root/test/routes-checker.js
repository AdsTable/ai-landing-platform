import axios from "axios";
import tough from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";
import fs from "fs";
import { getTestBaseUrl } from "../utils/url.js";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const jar = new tough.CookieJar();
const client = wrapper(axios.create({ baseURL: BASE_URL, jar, withCredentials: true }));

// ===== LOGIN =====
async function login(role) {
    const creds = {
        admin: { email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASS },
        tenant: { email: process.env.TEST_TENANT_EMAIL, password: process.env.TEST_TENANT_PASS }
    };
    try {
        const res = await client.post("/login", creds[role], { maxRedirects: 0, validateStatus: () => true });
        return res.status === 200 || res.status === 302;
    } catch {
        return false;
    }
}

async function checkRoute(url, method = "GET", data = null, headers = {}) {
    try {
        const res = await client.request({ url, method, data, headers, validateStatus: () => true });
        return { url, status: res.status, ok: res.status < 400 };
    } catch (err) {
        return { url, status: "ERR", ok: false };
    }
}

// ===== MAIN RUN =====
async function run() {
    console.log(`=== ROUTES CHECK START (${BASE_URL}) ===`);

    // Public routes
    const publicRoutes = [
        "/health",
        "/market/test-industry/en/test-location/test-type" // Example
    ];

    // Admin routes
    const adminRoutes = [
        "/admin",
        "/admin/generate",
        "/admin/push",
        "/admin/abtests",
        "/admin/seo",
        "/admin/social",
        "/admin/settings",
        "/admin/users",
        "/admin/push?test=true"
    ];

    // Tenant routes
    const tenantRoutes = [
        "/tenant/dashboard",
        "/tenant/theme",
        "/tenant/usage"
    ];

    // API routes
    const apiKey = process.env.API_KEY || "test-key";
    const apiRoutes = [
        { url: "/api/pages", headers: { "x-api-key": apiKey } },
        { url: "/api/tenants", headers: { "x-api-key": apiKey } },
        { url: "/api/me", headers: { "x-api-key": apiKey } },
        { url: "/api/translate", method: "POST", data: { text: "Hello", targetLang: "es" }, headers: { "x-api-key": apiKey } }
    ];

    let results = [];

    // Public
    console.log("Checking public routes...");
    for (const r of publicRoutes) {
        results.push(await checkRoute(r));
    }

    // Admin
    console.log("Checking admin routes...");
    if (await login("admin")) {
        for (const r of adminRoutes) {
            results.push(await checkRoute(r));
        }
    } else {
        console.warn("⚠ Admin login failed — admin routes skipped");
    }

    // Tenant
    console.log("Checking tenant routes...");
    if (await login("tenant")) {
        for (const r of tenantRoutes) {
            results.push(await checkRoute(r));
        }
    } else {
        console.warn("⚠ Tenant login failed — tenant routes skipped");
    }

    // API routes
    console.log("Checking API routes...");
    for (const r of apiRoutes) {
        results.push(await checkRoute(r.url, r.method || "GET", r.data || null, r.headers || {}));
    }

    // Output
    console.table(results);

    // ==== REVERSE CHECK ====
    console.log("=== ORPHAN VIEWS CHECK ===");
    const viewsDir = path.resolve("views");
    const ejsFiles = [];
    function scanViews(dir) {
        for (const file of fs.readdirSync(dir)) {
            const full = path.join(dir, file);
            if (fs.statSync(full).isDirectory()) {
                scanViews(full);
            } else if (file.endsWith(".ejs")) {
                ejsFiles.push(path.relative(viewsDir, full));
            }
        }
    }
    scanViews(viewsDir);

    const routeFiles = [];
    function scanRoutes(dir) {
        for (const file of fs.readdirSync(dir)) {
            const full = path.join(dir, file);
            if (fs.statSync(full).isDirectory()) {
                scanRoutes(full);
            } else if (file.endsWith(".js")) {
                routeFiles.push(fs.readFileSync(full, "utf-8"));
            }
        }
    }
    scanRoutes(path.resolve("routes"));

    ejsFiles.forEach(f => {
        const viewName = f.replace(/\\/g, "/").replace(".ejs", "");
        const used = routeFiles.some(content => content.includes(viewName));
        if (!used) {
            console.warn(`⚠ Orphan view detected: ${f}`);
        }
    });

    console.log("=== ROUTES CHECK COMPLETE ===");
}

run();
