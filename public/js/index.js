import { byId, api, go } from './common.js';

let currentSource = localStorage.getItem('typero_source') || 'dataset';

function setSource(src) {
  currentSource = src;
  localStorage.setItem('typero_source', src);
  byId('srcDataset').classList.toggle('active', src === 'dataset');
  byId('srcCustom').classList.toggle('active', src === 'custom');
  byId('fileRow').style.display = src === 'custom' ? '' : 'none';
}

byId('srcDataset').addEventListener('click', () => setSource('dataset'));
byId('srcCustom').addEventListener('click', () => setSource('custom'));
setSource(currentSource);

// --- Timer selection ---
let selectedTimer = Number(localStorage.getItem('typero_timer') || 60);

function setTimerButtons(val) {
  document.querySelectorAll('.timer-btn').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.val) === val);
  });
}

document.querySelectorAll('.timer-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    selectedTimer = Number(btn.dataset.val);
    localStorage.setItem('typero_timer', selectedTimer);
    byId('timerCustom').value = '';
    setTimerButtons(selectedTimer);
  });
});

byId('timerCustom').addEventListener('input', () => {
  const v = Number(byId('timerCustom').value);
  if (v >= 5) {
    selectedTimer = v;
    localStorage.setItem('typero_timer', selectedTimer);
    setTimerButtons(-1); // deactivate all preset buttons
  }
});

setTimerButtons(selectedTimer);

// show previously loaded custom text info
const savedName = localStorage.getItem('typero_custom_name');
const savedText = localStorage.getItem('typero_custom_text');
if (savedName && savedText) {
  byId('fileNote').textContent = `Loaded: ${savedName} (${Math.round(savedText.length / 1000)}k chars)`;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB

byId('file').addEventListener('change', async () => {
  const file = byId('file').files?.[0];
  if (!file) return;

  if (!file.name.endsWith('.txt') || file.type !== 'text/plain') {
    alert('Only plain .txt files are allowed.');
    byId('file').value = '';
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    alert(`File too large. Maximum size is 2 MB (your file is ${(file.size / 1024 / 1024).toFixed(1)} MB).`);
    byId('file').value = '';
    return;
  }

  const text = await file.text();
  localStorage.setItem('typero_custom_text', text);
  localStorage.setItem('typero_custom_name', file.name);
  byId('fileNote').textContent = `Loaded: ${file.name} (${Math.round(text.length / 1000)}k chars)`;
});

async function initUser() {
  const me = await api('/api/auth/me');
  const badge = byId('userBadge');
  const loginLink = byId('loginLink');
  const logoutBtn = byId('logoutBtn');
  const historyCard = byId('historyCard');
  const tableBody = document.querySelector('#historyTable tbody');

  if (!me.user) {
    badge.textContent = 'Guest mode';
    loginLink.style.display = 'inline';
    logoutBtn.style.display = 'none';
    return;
  }

  badge.textContent = `@${me.user.username}`;
  badge.href = '/profile';
  loginLink.style.display = 'none';
  logoutBtn.style.display = 'inline-block';
  historyCard.style.display = 'block';
  const { items } = await api('/api/sessions/mine');
  tableBody.innerHTML = '';
  for (const item of items.slice(0, 15)) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(item.created_at).toLocaleString()}</td>
      <td>${Math.round(item.net_wpm)}</td>
      <td>${Math.round(item.accuracy)}%</td>
      <td>${Math.round(item.peak_wpm)}</td>
      <td><a href="/results.html?id=${item.id}">View</a></td>
    `;
    tableBody.appendChild(tr);
  }
}

byId('logoutBtn').addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
    location.reload();
  } catch {
    alert('Logout failed.');
  }
});

const mobileModal = byId('mobileModal');
byId('mobileModalClose').addEventListener('click', () => { mobileModal.style.display = 'none'; });

byId('startBtn').addEventListener('click', async () => {
  const isMobile = navigator.maxTouchPoints > 0 && window.innerWidth < 1024;
  const isMobileUA = /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
  if (isMobile || isMobileUA) {
    mobileModal.style.display = 'flex';
    return;
  }
  let text = '';

  if (currentSource === 'custom') {
    const file = byId('file').files?.[0];
    if (file) {
      text = await file.text();
      localStorage.setItem('typero_custom_text', text);
      localStorage.setItem('typero_custom_name', file.name);
    } else {
      text = localStorage.getItem('typero_custom_text') || '';
    }
    if (!text.trim()) {
      alert('Please select a .txt file.');
      return;
    }
  } else {
    const data = await api('/api/dataset/default');
    text = Array.isArray(data.passages) ? data.passages.join(' ') : '';
  }

  const cfg = {
    mode: byId('mode').value,
    timerSeconds: selectedTimer,
    strictMode: byId('strict').value === 'strict',
    sourceType: currentSource,
    sourceLabel: currentSource === 'dataset' ? 'Public domain classics' : (localStorage.getItem('typero_custom_name') || 'Custom import'),
    fontSize: Number(byId('fontSize').value) || 30,
    zenMode: byId('zenMode').checked,
    wpmGoal: Number(byId('wpmGoal').value) || 0,
    text,
  };

  sessionStorage.setItem('typero_config', JSON.stringify(cfg));
  go('/typing');
});

// Font size label live update
byId('fontSize').addEventListener('input', () => {
  byId('fontVal').textContent = byId('fontSize').value;
});

initUser().catch(() => {});
