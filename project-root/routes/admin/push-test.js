import express from "express";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { sendPush } from "../../services/push.js";

const router = express.Router();

// Send test push to the currently logged-in user
router.post("/push/test", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        await sendPush(req.user, "Test Notification", "This is a test push notification!");
        res.json({ success: true, message: "Notification sent." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: "Failed to send notification" });
    }
});

export default router;
