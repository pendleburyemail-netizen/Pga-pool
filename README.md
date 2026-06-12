# ⛳ PGA Tour Golf Pool

Live golf pool web app for up to 8 participants. **Auto-detects the current PGA Tour tournament** — just deploy once and it works all season. Scores refresh from ESPN every 60 seconds.

## Features

- **Always current** — auto-detects whatever PGA Tour event ESPN is showing
- Up to 8 participants, each picks 6 golfers
- Best 4 of 6 picks count, MC/WD = +20 penalty
- Field dropdown populated live from ESPN (no hardcoded player list)
- Full tournament leaderboard tab with R1–R4 scores
- Picks saved in localStorage — survive page refreshes
- Shareable URL — anyone with the link sees live standings

## Deploy to Vercel (2 minutes)

**Option A — Vercel CLI**
```bash
npm i -g vercel
cd pga-pool
npm install
vercel --prod
```

**Option B — GitHub → Vercel**
1. Push this folder to a GitHub repo
2. vercel.com → New Project → import repo → Deploy
3. Share the URL with pool participants

## Local dev
```bash
npm install
npm run dev
# Open http://localhost:3000
```

## How it works

- `/api/scores` proxies ESPN's PGA scoreboard API and auto-picks the active/most-recent event
- Frontend polls every 60s and re-renders standings
- The player dropdown in Setup is populated from live ESPN data — no field list to maintain
- Picks stored in `localStorage` keyed to the browser, not the tournament (repick each week)
