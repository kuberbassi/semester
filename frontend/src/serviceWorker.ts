import { isTauriDesktop } from './utils/platform';

/**
 * Service Worker manager:
 * - In dev OR native Tauri desktop: actively unregister any Service Workers and clear
 *   CacheStorage so WebView2 always serves the fresh locally bundled UI with zero reload needed.
 * - On production web: registers `/sw.js` with auto-update behavior.
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const isDev = import.meta.env.DEV;
  const isDesktop = isTauriDesktop();

  if (isDev || isDesktop) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().catch(() => {});
      }
    });

    if ('caches' in window) {
      caches.keys().then((names) => {
        for (const name of names) {
          caches.delete(name).catch(() => {});
        }
      });
    }
    return;
  }

  // Production web deployment: register VitePWA service worker
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });
}
