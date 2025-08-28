import webpush from 'web-push';

webpush.setVapidDetails(
    process.env.VAPID_MAILTO || 'mailto:admin@yourdomain.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

/**
 * Save push subscription for user
 */
export function subscribePush(req, res) {
    const subscription = req.body;
    req.user.pushSubscription = subscription;
    req.user.save();
    res.status(201).json({});
}

/**
 * Send push notification to a user
 */
export function sendPush(user, title, message) {
    if (user.pushSubscription) {
        webpush.sendNotification(
            user.pushSubscription,
            JSON.stringify({ title, message })
        ).catch(err => console.error(err));
    }
}
