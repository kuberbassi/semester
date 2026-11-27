(function () {
  try {
    var saved = localStorage.getItem('Semester_theme');
    var html = document.documentElement;
    if (saved === 'dark') {
      html.classList.add('dark');
      html.classList.remove('light');
    } else {
      html.classList.remove('dark');
      html.classList.add('light');
    }
  } catch (e) { /* localStorage blocked — stay light */ }

  // Native Tauri desktop apps bundle assets locally; purge any legacy PWA Service Worker
  // so WebView2 never serves a stale cached UI across builds.
  try {
    var isDesktop =
      '__TAURI_INTERNALS__' in window ||
      '__TAURI__' in window ||
      location.protocol === 'tauri:' ||
      location.hostname === 'tauri.localhost';
    if (isDesktop && 'serviceWorker' in navigator) {
      var hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        return Promise.all(regs.map(function (r) { return r.unregister(); }));
      }).then(function () {
        if ('caches' in window) {
          return caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) { return caches.delete(k); }));
          });
        }
      }).then(function () {
        if (hadController && !sessionStorage.getItem('semester_sw_purged')) {
          sessionStorage.setItem('semester_sw_purged', '1');
          location.reload();
        }
      });
    }
  } catch (e) { /* ignore */ }
})();
