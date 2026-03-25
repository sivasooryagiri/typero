import { byId, api, go } from './common.js';

let currentPerf = [];
let currentData = null;
const ac = new AbortController();

function drawGraph(points) {
  const canvas = byId('graph');
  const ctx = canvas.getContext('2d');

  // Match canvas internal resolution to display size
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width || canvas.offsetWidth || 900;
  canvas.height = rect.height || canvas.offsetHeight || 280;

  const w = canvas.width;
  const h = canvas.height;
  const PL = 48, PB = 28, PT = 16, PR = 16;
  const gw = w - PL - PR;
  const gh = h - PT - PB;

  ctx.clearRect(0, 0, w, h);

  if (!points.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '14px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data recorded', w / 2, h / 2);
    return;
  }

  const maxWpm = Math.max(20, ...points.map((p) => p.wpm));

  // Y axis gridlines + labels
  const ySteps = 4;
  ctx.font = '11px Inter, sans-serif';
  for (let i = 0; i <= ySteps; i++) {
    const val = Math.round((maxWpm / ySteps) * i);
    const y = PT + gh - (i / ySteps) * gh;
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(PL + gw, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign = 'right';
    ctx.fillText(val, PL - 6, y + 4);
  }

  // Y axis label
  ctx.save();
  ctx.translate(10, PT + gh / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'center';
  ctx.fillText('WPM', 0, 0);
  ctx.restore();

  // X axis labels
  const xStepCount = Math.min(points.length - 1, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.textAlign = 'center';
  for (let i = 0; i <= xStepCount; i++) {
    const idx = Math.round((i / xStepCount) * (points.length - 1));
    const sec = points[idx]?.second ?? idx;
    const x = PL + (idx / Math.max(points.length - 1, 1)) * gw;
    ctx.fillText(`${sec}s`, x, h - 4);
  }

  // X axis label
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'center';
  ctx.fillText('Time', PL + gw / 2, h - 4 + 14);

  // Axis lines
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PL, PT); ctx.lineTo(PL, PT + gh); ctx.lineTo(PL + gw, PT + gh);
  ctx.stroke();

  // Data line
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = PL + (i / Math.max(points.length - 1, 1)) * gw;
    const y = PT + gh - (p.wpm / maxWpm) * gh;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Peak dot + label
  const peak = points.reduce((a, b) => (a.wpm > b.wpm ? a : b));
  const peakI = points.indexOf(peak);
  const px = PL + (peakI / Math.max(points.length - 1, 1)) * gw;
  const py = PT + gh - (peak.wpm / maxWpm) * gh;
  ctx.fillStyle = '#ff4545';
  ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff4545';
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${peak.wpm} WPM`, px, py - 10);
}

function buildMissTable(mistakeChars) {
  const entries = Object.entries(mistakeChars).sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (!entries.length) return '<p>No character mistakes — clean session!</p>';
  const max = entries[0][1];
  const rows = entries.map(([ch, n]) => {
    const barPct = Math.round((n / max) * 100);
    const label = ch === ' ' ? '␣' : ch;
    return `<tr>
      <td><code style="font-size:15px">${label}</code></td>
      <td style="color:var(--muted)">${n} miss${n > 1 ? 'es' : ''}</td>
      <td class="miss-bar-wrap"><div class="miss-bar" style="width:${barPct}%"></div></td>
    </tr>`;
  }).join('');
  return `<table class="table miss-table"><thead><tr>
    <th>Char</th><th>Count</th><th></th>
  </tr></thead><tbody>${rows}</tbody></table>`;
}

function buildImproveFeedback(stats, netWpm, accuracy) {
  const parts = [];

  if (netWpm >= 80) parts.push('<p>Speed: fast. Focus on keeping accuracy clean at this pace.</p>');
  else if (netWpm >= 50) parts.push('<p>Speed: solid. Push past plateaus with short daily sessions.</p>');
  else if (netWpm >= 25) parts.push('<p>Speed: building. Prioritise consistency over rushing.</p>');
  else parts.push('<p>Speed: early stage. Slow down and nail accuracy first — speed follows.</p>');

  if (accuracy >= 98) parts.push('<p>Accuracy: excellent. Very clean typing.</p>');
  else if (accuracy >= 93) parts.push('<p>Accuracy: good. A few slip-ups — watch the characters below.</p>');
  else if (accuracy >= 80) parts.push('<p>Accuracy: needs attention. Slow down slightly to build cleaner habits.</p>');
  else parts.push('<p>Accuracy: low. Focus on correctness before speed.</p>');

  const cats = ['letters', 'numbers', 'symbols'].map((key) => {
    const total = stats?.[key]?.total || 0;
    const wrong = stats?.[key]?.wrong || 0;
    if (total < 5 || wrong === 0) return null;
    return { key, acc: ((total - wrong) / total) * 100, wrong };
  }).filter(Boolean).sort((a, b) => a.acc - b.acc);

  if (cats.length) {
    parts.push('<p style="color:var(--muted);font-size:13px">Errors by type: ' +
      cats.map((r) => `${r.key} ${Math.round(r.acc)}% (${r.wrong} mistake${r.wrong > 1 ? 's' : ''})`).join(' · ') +
      '</p>');
  }

  parts.push(buildMissTable(stats?.mistakeChars || {}));
  return parts.join('');
}

function downloadReport(data, stats) {
  const netWpm = Math.round(data.net_wpm ?? data.netWpm ?? 0);
  const accuracy = Math.round(data.accuracy ?? 0);
  const duration = Math.round(data.duration_seconds ?? data.durationSeconds ?? 0);
  const source = data.source_label || data.sourceLabel || '-';
  const mistakeChars = stats?.mistakeChars || {};
  const topMistakes = Object.entries(mistakeChars).sort((a, b) => b[1] - a[1]);

  const lines = [
    'TYPERO SESSION REPORT',
    '='.repeat(30),
    `Date:        ${new Date().toLocaleString()}`,
    `Source:      ${source}`,
    `Duration:    ${duration}s`,
    '',
    'SCORES',
    '-'.repeat(30),
    `Net WPM:     ${netWpm}`,
    `Gross WPM:   ${Math.round(data.gross_wpm ?? data.grossWpm ?? 0)}`,
    `Peak WPM:    ${Math.round(data.peak_wpm ?? data.peakWpm ?? 0)}`,
    `CPM:         ${Math.round(data.cpm ?? 0)}`,
    `Accuracy:    ${accuracy}%`,
    '',
  ];

  if (topMistakes.length) {
    lines.push('MISSED CHARACTERS', '-'.repeat(30));
    for (const [ch, n] of topMistakes.slice(0, 20)) {
      lines.push(`  "${ch === ' ' ? '[space]' : ch}"  ×${n}`);
    }
    lines.push('');
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `typero-${new Date().toISOString().slice(0, 10)}-${netWpm}wpm.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

async function init() {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');

  if (id) {
    currentData = await api(`/api/sessions/${id}`);
  } else {
    currentData = JSON.parse(sessionStorage.getItem('typero_last_result') || '{}');
  }

  const data = currentData;
  byId('rNet').textContent = String(Math.round(data.net_wpm ?? data.netWpm ?? 0));
  byId('rGross').textContent = String(Math.round(data.gross_wpm ?? data.grossWpm ?? 0));
  byId('rPeak').textContent = String(Math.round(data.peak_wpm ?? data.peakWpm ?? 0));
  byId('rCpm').textContent = String(Math.round(data.cpm ?? 0));
  byId('rAcc').textContent = `${Math.round(data.accuracy ?? 0)}%`;

  const duration = Math.round(data.duration_seconds ?? data.durationSeconds ?? 0);
  const source = data.source_label || data.sourceLabel || 'source';
  byId('summary').textContent = `Duration: ${duration}s · Source: ${source}`;

  currentPerf = data.performance_series || data.performanceSeries || [];
  // Wait a tick so canvas has layout dimensions
  requestAnimationFrame(() => drawGraph(currentPerf));

  const stats = data.category_stats || data.categoryStats || {};
  const netWpm = Math.round(data.net_wpm ?? data.netWpm ?? 0);
  const accuracy = data.accuracy ?? 0;
  byId('improve').innerHTML = buildImproveFeedback(stats, netWpm, accuracy);

  byId('downloadBtn').addEventListener('click', () => downloadReport(data, stats));
}


window.addEventListener('resize', () => {
  if (currentPerf.length) requestAnimationFrame(() => drawGraph(currentPerf));
}, { signal: ac.signal });

if (window._typeroCleanup) {
  window._typeroCleanup.push(() => ac.abort());
}

init().catch((e) => {
  byId('summary').textContent = e.message;
});
