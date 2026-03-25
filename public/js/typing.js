import { byId, api, go, charCategory, pickRandom, round } from './common.js';

const cfg = JSON.parse(sessionStorage.getItem('typero_config') || '{}');
if (!cfg.text || typeof cfg.text !== 'string' || !cfg.text.trim()) { go('/'); }

byId('modeTag').textContent = cfg.strictMode ? 'Strict mode' : 'Forgiving mode';

// Apply font size
if (cfg.fontSize) {
  byId('typingArea').style.fontSize = `${cfg.fontSize}px`;
}

// Apply zen mode: hide live stats
if (cfg.zenMode) {
  const m = document.querySelector('.metrics');
  if (m) m.style.display = 'none';
}

const corpusWords = String(cfg.text).split(/\s+/).filter(Boolean);
if (!corpusWords.length) { go('/'); }
let importedPos = 0;
let chars = [];

const typingArea = byId('typingArea');
const sink = byId('inputSink');
let idx = 0;
let startedAt = 0;
let ended = false;
let secTick = 0;
let remaining = cfg.mode === 'timed' ? Number(cfg.timerSeconds || 30) : null;
let totalTyped = 0;
let correctTyped = 0;
let mistakes = 0;
const mistakeChars = {};
const inputHistory = [];
let strictCurrentWrong = false;

const perf = [];
const category = {
  letters: { total: 0, wrong: 0 },
  numbers: { total: 0, wrong: 0 },
  symbols: { total: 0, wrong: 0 },
};

function buildChunk(wordCount = 90) {
  const out = [];
  if (cfg.sourceType === 'custom') {
    for (let i = 0; i < wordCount; i++) {
      out.push(corpusWords[importedPos % corpusWords.length]);
      importedPos++;
    }
  } else {
    let prev = '';
    for (let i = 0; i < wordCount; i++) {
      let word = pickRandom(corpusWords);
      let guard = 0;
      while (word === prev && guard < 6) { word = pickRandom(corpusWords); guard++; }
      out.push(word);
      prev = word;
    }
  }
  return Array.from(out.join(' ') + ' ');
}

function refillBuffer() {
  if (chars.length - idx < 240) {
    chars = chars.concat(buildChunk(120));
  }
  if (idx > 600) {
    const shift = 400;
    chars = chars.slice(shift);
    // Copy dataset manually — DOMStringMap spread is unreliable across browsers
    const keys = Object.keys(sink.dataset);
    const saved = {};
    keys.forEach((k) => { saved[k] = sink.dataset[k]; });
    keys.forEach((k) => { delete sink.dataset[k]; });
    Object.keys(saved).forEach((k) => {
      if (!k.startsWith('st')) return;
      const oldIndex = Number(k.slice(2));
      if (Number.isFinite(oldIndex) && oldIndex >= shift) {
        sink.dataset[`st${oldIndex - shift}`] = saved[k];
      }
    });
    idx -= shift;
  }
}

function resetSession() {
  idx = 0;
  importedPos = 0;
  startedAt = 0;
  ended = false;
  secTick = 0;
  remaining = cfg.mode === 'timed' ? Number(cfg.timerSeconds || 30) : null;
  totalTyped = 0;
  correctTyped = 0;
  mistakes = 0;
  strictCurrentWrong = false;
  Object.keys(mistakeChars).forEach((k) => delete mistakeChars[k]);
  category.letters.total = 0; category.letters.wrong = 0;
  category.numbers.total = 0; category.numbers.wrong = 0;
  category.symbols.total = 0; category.symbols.wrong = 0;
  perf.length = 0;
  inputHistory.length = 0;
  Object.keys(sink.dataset).forEach((k) => delete sink.dataset[k]);
  chars = buildChunk(220);
  renderText();
  updateMetrics();
}

function elapsedSeconds() {
  if (!startedAt) return 0;
  return (Date.now() - startedAt) / 1000;
}

function wpm(charCount, seconds) {
  if (!seconds) return 0;
  return (charCount / 5) * (60 / seconds);
}

function renderText() {
  typingArea.innerHTML = '';
  const end = Math.min(chars.length, idx + 420);
  for (let i = 0; i < end; i++) {
    const span = document.createElement('span');
    span.textContent = chars[i];
    span.className = 'char ';
    if (i < idx) {
      span.className += sink.dataset[`st${i}`] === 'wrong' ? 'wrong' : 'typed';
    } else if (i === idx) {
      span.className += strictCurrentWrong ? 'current-wrong' : 'current';
    } else {
      span.className += 'future';
    }
    if (chars[i] === ' ') span.className += ' space-char';
    typingArea.appendChild(span);
    if (i === idx) span.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
}

function updateMetrics() {
  const secs = Math.max(elapsedSeconds(), 0.1);
  const gross = wpm(totalTyped, secs);
  const net = wpm(correctTyped, secs);
  const cpm = (correctTyped * 60) / secs;
  const acc = totalTyped ? (correctTyped / totalTyped) * 100 : 100;

  byId('netWpm').textContent = String(Math.round(net));
  byId('cpm').textContent = String(Math.round(cpm));
  byId('accuracy').textContent = `${Math.round(acc)}%`;
  byId('wpmAccuracy').textContent = `${Math.round(net)} • ${Math.round(acc)}%`;
  byId('timerText').textContent = cfg.mode === 'timed'
    ? `${Math.max(0, Math.ceil(remaining))}s`
    : `${Math.floor(secs)}s`;

  return { gross, net, cpm, acc };
}

function recordSecond() {
  const s = Math.floor(elapsedSeconds());
  if (s !== secTick) {
    secTick = s;
    const net = wpm(correctTyped, Math.max(elapsedSeconds(), 1));
    perf.push({ second: s, wpm: round(net) });
  }
}

async function finish(reason) {
  if (ended) return;
  if (totalTyped === 0) {
    go('/');
    return;
  }
  ended = true;

  const seconds = Math.max(elapsedSeconds(), 0.2);
  const metrics = updateMetrics();
  const payload = {
    mode: cfg.mode,
    strictMode: cfg.strictMode,
    timerSeconds: cfg.mode === 'timed' ? Number(cfg.timerSeconds) : null,
    includeLetters: true,
    includeNumbers: true,
    includeSymbols: true,
    sourceType: cfg.sourceType,
    sourceLabel: cfg.sourceLabel,
    durationSeconds: round(seconds),
    grossWpm: round(metrics.gross),
    netWpm: round(metrics.net),
    cpm: round(metrics.cpm),
    accuracy: round(metrics.acc),
    totalChars: totalTyped,
    correctChars: correctTyped,
    mistakeCount: mistakes,
    peakWpm: perf.length ? Math.max(...perf.map((p) => p.wpm)) : round(metrics.net),
    performanceSeries: perf,
    categoryStats: { ...category, mistakeChars },
    reason,
  };

  const res = await api('/api/sessions', { method: 'POST', body: JSON.stringify(payload) });
  sessionStorage.setItem('typero_last_result', JSON.stringify(payload));
  go(`/results.html?id=${res.id}`);
}

function handleInput(ch) {
  if (ended) return;
  if (!startedAt) startedAt = Date.now();
  refillBuffer();

  const expected = chars[idx];
  const cat = charCategory(expected);
  const key = `st${idx}`;
  const prevStatus = sink.dataset[key];
  const idxBefore = idx;
  category[cat].total += 1;
  totalTyped += 1;

  let isCorrect = false;
  if (ch === expected) {
    isCorrect = true;
    strictCurrentWrong = false;
    correctTyped += 1;
    sink.dataset[key] = 'ok';
    idx += 1;
  } else {
    if (cfg.strictMode) strictCurrentWrong = true;
    mistakes += 1;
    category[cat].wrong += 1;
    mistakeChars[expected] = (mistakeChars[expected] || 0) + 1;
    sink.dataset[key] = 'wrong';
    if (!cfg.strictMode) idx += 1;
  }

  playClick();
  inputHistory.push({ idxBefore, idxAfter: idx, key, prevStatus, expected, cat, isCorrect });
  renderText();
  updateMetrics();
  recordSecond();
}

function handleBackspace() {
  if (ended) return;
  const last = inputHistory.pop();
  if (!last) return;

  idx = last.idxBefore;
  strictCurrentWrong = false;
  totalTyped = Math.max(0, totalTyped - 1);
  category[last.cat].total = Math.max(0, category[last.cat].total - 1);

  if (last.isCorrect) {
    correctTyped = Math.max(0, correctTyped - 1);
  } else {
    mistakes = Math.max(0, mistakes - 1);
    category[last.cat].wrong = Math.max(0, category[last.cat].wrong - 1);
    if (mistakeChars[last.expected]) {
      mistakeChars[last.expected] -= 1;
      if (mistakeChars[last.expected] <= 0) delete mistakeChars[last.expected];
    }
  }

  if (last.prevStatus === undefined) {
    delete sink.dataset[last.key];
  } else {
    sink.dataset[last.key] = last.prevStatus;
  }

  renderText();
  updateMetrics();
}

// --- Sound ---
let soundOn = localStorage.getItem('typero_sound') !== '0';
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function makeNoiseBuf(ctx, ms) {
  const len = Math.floor(ctx.sampleRate * ms / 1000);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function playClick() {
  if (!soundOn) return;
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;

    // Phase 1 — crisp click (key actuating): 3 ms highpassed noise, sharp decay
    const clickSrc = ctx.createBufferSource();
    clickSrc.buffer = makeNoiseBuf(ctx, 3);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3500;
    const gClick = ctx.createGain();
    gClick.gain.setValueAtTime(0.35, t);
    gClick.gain.exponentialRampToValueAtTime(0.001, t + 0.003);
    clickSrc.connect(hp); hp.connect(gClick); gClick.connect(ctx.destination);
    clickSrc.start(t);

    // Phase 2 — soft thud (key bottoming out): 10 ms lowpassed noise, gentler
    const thudSrc = ctx.createBufferSource();
    thudSrc.buffer = makeNoiseBuf(ctx, 10);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    const gThud = ctx.createGain();
    gThud.gain.setValueAtTime(0.12, t + 0.002);
    gThud.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
    thudSrc.connect(lp); lp.connect(gThud); gThud.connect(ctx.destination);
    thudSrc.start(t + 0.002);
  } catch { /* audio not available */ }
}

function syncSoundBtn() {
  byId('soundIconOn').style.display = soundOn ? '' : 'none';
  byId('soundIconOff').style.display = soundOn ? 'none' : '';
}

byId('soundBtn').addEventListener('click', () => {
  soundOn = !soundOn;
  localStorage.setItem('typero_sound', soundOn ? '1' : '0');
  syncSoundBtn();
});

syncSoundBtn();

// --- Event listeners with cleanup for SPA ---
const ac = new AbortController();

let tabHeld = false;
window.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') { e.preventDefault(); tabHeld = true; return; }
  if (tabHeld && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); finish('stopped').catch(() => {}); return; }
  if (ended) return;
  if (e.key === 'Backspace') { e.preventDefault(); handleBackspace(); return; }
  if (e.key.length === 1) { e.preventDefault(); handleInput(e.key); }
}, { signal: ac.signal });

window.addEventListener('keyup', (e) => { if (e.key === 'Tab') tabHeld = false; }, { signal: ac.signal });

byId('restartBtn').addEventListener('click', () => { resetSession(); sink.focus(); });
byId('stopBtn').addEventListener('click', () => { finish('stopped').catch(() => {}); });

typingArea.addEventListener('click', () => sink.focus());
sink.focus();
resetSession();

const ticker = setInterval(() => {
  if (ended || !startedAt) return;
  if (cfg.mode === 'timed') {
    remaining -= 0.25;
    if (remaining <= 0) { remaining = 0; finish('timer_end').catch(() => {}); }
  }
  updateMetrics();
  recordSecond();
}, 250);

// Register cleanup so SPA router can tear this down
if (window._typeroCleanup) {
  window._typeroCleanup.push(() => {
    ac.abort();
    clearInterval(ticker);
  });
}
