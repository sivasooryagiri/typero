export const byId = (id) => document.getElementById(id);

// SPA-safe navigation: uses router when in fullscreen, normal nav otherwise
export function go(url) {
  if ((document.fullscreenElement || localStorage.getItem('typero_fs') === '1') && window.typeroNavigate) {
    window.typeroNavigate(url);
  } else {
    location.href = url;
  }
}

export async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function round(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function charCategory(ch) {
  if (/[A-Za-z]/.test(ch)) return 'letters';
  if (/[0-9]/.test(ch)) return 'numbers';
  return 'symbols';
}

export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// --- Fullscreen button injection (re-callable for SPA page swaps) ---
let fsAbort = null;
let intentionalExit = false;

function injectFsButton() {
  // Tear down previous instance
  if (fsAbort) fsAbort.abort();
  fsAbort = new AbortController();

  const old = document.getElementById('typero-fs-btn');
  if (old) old.remove();
  const oldHint = document.getElementById('typero-fs-hint');
  if (oldHint) oldHint.remove();

  const inline = document.querySelector('.top .inline');
  if (!inline) return;

  const btn = document.createElement('button');
  btn.id = 'typero-fs-btn';
  btn.style.cssText = 'width:36px;height:36px;padding:0;font-size:17px;flex-shrink:0;';

  const hint = document.createElement('span');
  hint.id = 'typero-fs-hint';
  hint.style.cssText = 'font-size:11px;opacity:0.35;white-space:nowrap;';
  hint.textContent = 'Ctrl+Shift+F';

  function syncBtn() {
    btn.textContent = document.fullscreenElement ? '✕' : '⛶';
    btn.title = document.fullscreenElement ? 'Exit fullscreen (Ctrl+Shift+F)' : 'Fullscreen (Ctrl+Shift+F)';
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      localStorage.setItem('typero_fs', '1');
    } else {
      intentionalExit = true;
      localStorage.removeItem('typero_fs');
      document.exitFullscreen();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        localStorage.setItem('typero_fs', '1');
      } else {
        intentionalExit = true;
        localStorage.removeItem('typero_fs');
        document.exitFullscreen();
      }
    }
    if (e.key === 'Escape') {
      intentionalExit = true;
      localStorage.removeItem('typero_fs');
    }
  }, { signal: fsAbort.signal });

  document.addEventListener('fullscreenchange', () => {
    syncBtn();
    if (!document.fullscreenElement && !intentionalExit && localStorage.getItem('typero_fs') === '1') {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    intentionalExit = false;
  }, { signal: fsAbort.signal });

  syncBtn();
  inline.appendChild(hint);
  inline.appendChild(btn);
}

// Expose for SPA router to call after page swap
window._typeroInjectFs = injectFsButton;
document.addEventListener('DOMContentLoaded', injectFsButton);
