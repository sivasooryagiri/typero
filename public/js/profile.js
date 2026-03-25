import { byId, api } from './common.js';

function getLevel(words) {
  if (words === 0) return 0;
  if (words < 100) return 1;
  if (words < 300) return 2;
  if (words < 600) return 3;
  return 4;
}

function renderHeatmap(heatmapData) {
  const container = byId('heatmap');
  const dayMap = {};
  for (const d of heatmapData) dayMap[d.date] = d;

  // Build last 365 days
  const today = new Date();
  const days = [];
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  // Pad start so first cell sits in the correct weekday row (0=Sun)
  const startPad = new Date(days[0]).getDay();
  container.innerHTML = '';

  for (let i = 0; i < startPad; i++) {
    const el = document.createElement('div');
    container.appendChild(el); // empty spacer
  }

  for (const date of days) {
    const d = dayMap[date];
    const words = d?.words || 0;
    const el = document.createElement('div');
    el.className = `heat-cell lv${getLevel(words)}`;
    if (words > 0) {
      el.title = `${date} — ${words} words, ${d.sessions} session${d.sessions > 1 ? 's' : ''}, best ${d.bestWpm} WPM`;
    } else {
      el.title = date;
    }
    container.appendChild(el);
  }
}

async function init() {
  let data;
  try {
    data = await api('/api/profile/stats');
  } catch {
    byId('profileName').textContent = 'Not logged in';
    byId('loginNote').style.display = 'block';
    return;
  }

  byId('profileName').textContent = `@${data.username}`;
  byId('pSessions').textContent = data.totals.sessions.toLocaleString();
  byId('pWords').textContent = data.totals.words.toLocaleString();
  byId('pBest').textContent = data.totals.bestWpm;
  byId('pAcc').textContent = `${data.totals.avgAccuracy}%`;

  renderHeatmap(data.heatmap);
}

init().catch(() => {
  byId('profileName').textContent = 'Not logged in';
  byId('loginNote').style.display = 'block';
});
