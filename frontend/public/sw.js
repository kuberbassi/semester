// Service Worker for Background Push Notifications
/// <reference lib="webworker" />

// Cache version
const CACHE_VERSION = 'semester-v2';
const CACHE_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
    console.log('[SW] Install event');
    event.waitUntil(
        caches.open(CACHE_VERSION).then((cache) => {
            console.log('[SW] Caching assets');
            return cache.addAll(CACHE_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activate event');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_VERSION) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Push event - handle background notifications
self.addEventListener('push', (event) => {
    console.log('[SW] Push received', event);

    let data = {
        title: 'Semester Notification',
        body: 'New update available',
        icon: '/pwa-icon-192.png',
        badge: '/pwa-icon-192.png',
        tag: 'default',
        data: {}
    };

    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            console.error('[SW] Error parsing push data:', e);
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon || '/pwa-icon-192.png',
        badge: data.badge || '/pwa-icon-192.png',
        tag: data.tag,
        data: data.data,
        vibrate: [200, 100, 200],
        requireInteraction: false,
        actions: [
            {
                action: 'open',
                title: 'View',
                icon: '/pwa-icon-192.png'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification click', event);

    event.notification.close();

    if (event.action === 'close') {
        return;
    }

    // Open or focus the app
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Check if there's already a window open
            for (const client of clientList) {
                if (client.url.includes(self.registration.scope) && 'focus' in client) {
                    return client.focus();
                }
            }
            // Open new window
            if (clients.openWindow) {
                const url = event.notification.data?.url || '/notifications';
                return clients.openWindow(url);
            }
        })
    );
});
