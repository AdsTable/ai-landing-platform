const CACHE_NAME = "ai-landing-cache-v1";
const urlsToCache = ["/", "/manifest.json"];

// Install event - cache static files
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// Fetch event - serve cached or fetch from network
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});

// Push event - show notification
self.addEventListener("push", event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Notification", {
      body: data.message || "",
      icon: "/icon-192.png"
    })
  );
});
