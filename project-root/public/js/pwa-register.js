// Register the service worker for PWA support
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js")
    .then(reg => console.log("Service Worker registered:", reg))
    .catch(err => console.error("Service Worker registration failed:", err));
}
