# Typero

A distraction-free typing speed test. No ads, no bloat, no nonsense.

Built for people who want to get better at typing — bring your own files, track your WPM, see your accuracy, and improve over time.

Live at **[typero.app](https://typero.app)**

---

## Features

- Timed and open-ended typing modes
- Strict mode (must fix errors) and Forgiving mode
- Import your own `.txt` files for domain-specific practice
- Live WPM, CPM, and accuracy tracking
- Per-session performance graph
- Activity heatmap and streak tracking (logged-in users)
- Sound feedback
- Zen mode (hide stats while typing)
- No ads, no tracking, no email required

---

## Tech Stack

- **Backend:** Node.js, Express, SQLite
- **Frontend:** Vanilla JS, HTML, CSS — no frameworks
- **Auth:** JWT + bcrypt, HTTP-only cookies
- **Built with:** Claude Code (Opus & Sonnet) — fully vibecoded

---

## Self-hosting

```bash
git clone https://github.com/sivasooryagiri/typero.git
cd typero
npm install
mkdir -p data
npm start
```

Runs on `http://localhost:3017` by default.

---

## Built by

**Sivasoorya** aka [DeadTechGuy](https://deadtechguy.fun)

Built for personal use, now open for everyone. Bug reports → [dtg@soluto.in](mailto:dtg@soluto.in)

A [Soluto](https://soluto.in) Product
