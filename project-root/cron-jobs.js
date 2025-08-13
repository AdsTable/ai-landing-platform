import cron from "node-cron";
import { massGenerate } from "./services/massGenerator.js";

console.log("Cron jobs initialized...");

// Every day at 03:00
cron.schedule("0 3 * * *", async () => {
    console.log(`[${new Date().toISOString()}] Running mass generation job...`);
    try {
        await massGenerate();
        console.log("Mass generation completed.");
    } catch (err) {
        console.error("Mass generation failed:", err);
    }
});
