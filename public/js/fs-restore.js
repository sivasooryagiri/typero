// Runs early in <head>. Two jobs:
// 1. Restore fullscreen on first interaction after a real page load
// 2. SPA router: when fullscreen is active, intercept navigation to prevent
//    the browser from exiting fullscreen (browser ALWAYS exits on navigation)

(function () {
  window._typeroCleanup = [];

  // --- Fullscreen restore ---
  if (localStorage.getItem('typero_fs') === '1' && !document.fullscreenElement) {
    function restore() {
      document.removeEventListener('click', restore, true);
      document.removeEventListener('keydown', restore, true);
      document.removeEventListener('mousedown', restore, true);
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(function () {});
      }
    }
    document.addEventListener('click', restore, true);
    document.addEventListener('keydown', restore, true);
    document.addEventListener('mousedown', restore, true);
  }

  // --- SPA router (only active when fullscreen pref is set) ---
  function wantsFs() {
    return document.fullscreenElement || localStorage.getItem('typero_fs') === '1';
  }

  async function navigate(url) {
    // Run cleanup from previous page's JS
    while (window._typeroCleanup.length) window._typeroCleanup.pop()();

    try {
      var res = await fetch(url);
      var html = await res.text();
      var parser = new DOMParser();
      var doc = parser.parseFromString(html, 'text/html');

      // Collect module script sources before removing
      var moduleSources = [];
      doc.body.querySelectorAll('script[type="module"]').forEach(function (s) {
        if (s.getAttribute('src')) moduleSources.push(s.getAttribute('src'));
      });
      // Remove ALL scripts from parsed body (they won't execute via innerHTML anyway)
      doc.body.querySelectorAll('script').forEach(function (s) { s.remove(); });

      document.title = doc.title;
      document.body.innerHTML = doc.body.innerHTML;
      history.pushState({}, '', url);

      // Load page-specific module scripts (cache-busted so they re-execute)
      for (var i = 0; i < moduleSources.length; i++) {
        var el = document.createElement('script');
        el.type = 'module';
        el.src = moduleSources[i] + '?_=' + Date.now();
        document.body.appendChild(el);
      }

      // Re-inject fullscreen button (common.js exposes this)
      if (window._typeroInjectFs) window._typeroInjectFs();
    } catch (err) {
      location.href = url; // fallback
    }
  }

  window.typeroNavigate = navigate;

  // Intercept <a> clicks
  document.addEventListener('click', function (e) {
    if (!wantsFs()) return;
    var a = e.target.closest ? e.target.closest('a') : null;
    if (!a || !a.href) return;
    // Don't intercept the fullscreen button
    if (a.id === 'typero-fs-btn') return;
    try {
      var url = new URL(a.href);
      if (url.origin !== location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      navigate(url.pathname + url.search);
    } catch (err) { /* ignore */ }
  });

  // Handle browser back/forward
  window.addEventListener('popstate', function () {
    if (wantsFs()) {
      navigate(location.pathname + location.search);
    }
  });
})();
