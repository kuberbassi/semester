(function () {
  try {
    var saved = localStorage.getItem('semester_site_theme');
    var root = document.documentElement;
    if (saved === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      root.setAttribute('data-theme', 'dark');
    }
  } catch (_) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
