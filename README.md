# Survivor Fantasy App

Fantasy league tracker for **Survivor Season 51**, built with React + Vite +
TypeScript. Bio and photo data comes directly from
`SurvivorPlayersandBreakdown.docx`; draft ownership comes from
`playersdrafted.txt`; scoring rules come from `leaguerules.txt`.

## What's in here

- **Dashboard** &mdash; live standings for all 10 managers, plus the full
  scoring system displayed by category (Survival, Challenge, Advantage,
  Social & Drama).
- **Players** &mdash; all 21 real Season 51 castaways with actual CBS photos,
  age, hometown, current residence, occupation, and full bio. Each card
  shows who drafted them and lets you mark them voted out.
- **Teams** &mdash; every manager (Colson, Paige, Annes, WASH Mylo and Monts,
  Caleb, Zach, Phil, Ellie, Morgan, Mitch, Wes) with their drafted roster,
  running point total, and remaining alive players.
- **Scoring** &mdash; per-episode grid to tick the 15 scoring events from
  `leaguerules.txt` for each player. Points update immediately and persist
  in the browser via `localStorage`.

## Data sources

| Where the data lives            | What's in it                              |
|---------------------------------|-------------------------------------------|
| `src/data/players.ts`           | All 21 castaways with bio + `/photo` URLs |
| `public/players/01.jpeg`&hellip;`21.jpeg` | Real CBS photos extracted from the docx (in draft order) |
| `src/data/scoringRules.ts`      | The 15 point categories from `leaguerules.txt` |
| `src/data/playerService.ts`     | Runtime service: rosters, scoring, persistence |

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:5173/ (or whatever port Vite prints).

## Persistence &mdash; two backends, same API

The app persists league state (vote-outs + per-episode scoring events)
behind a `StorageBackend` interface in `src/data/storage.ts`. There are two
implementations and the app picks between them at build time:

| Backend            | When it's used                                   | Where the data lives                      |
|--------------------|--------------------------------------------------|-------------------------------------------|
| `LocalStorageBackend` | `VITE_USE_REMOTE` is unset (the default)      | Browser `localStorage` (per-device)       |
| `RemoteBackend`    | `VITE_USE_REMOTE=1` at build time                | Vercel KV via `/api/league` (shared)      |

Rapid clicks are debounced (250 ms) into a single write so ticking 15
checkboxes results in one round-trip, not 15. Writes use optimistic
concurrency: the client sends the version it started from, the server
rejects with `409` if someone else got there first, and the client
auto-reloads the fresh state.

## Deploying to Vercel

1. **Push to GitHub** (already done for this repo).
2. In the Vercel dashboard: **Add New Project** &rarr; import
   `mitchellray-gh/Survivor-Fantasy`. Framework preset auto-detects as
   Vite.
3. **Add a Redis store**: Project &rarr; Storage &rarr; **Marketplace**
   &rarr; add **Upstash Redis** (free tier: 10k commands/day, 256 MB).
   Connect it to this project. Vercel auto-populates
   `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or, if you installed the
   Upstash integration directly, `UPSTASH_REDIS_REST_URL` /
   `UPSTASH_REDIS_REST_TOKEN`) in the project environment &mdash; the
   `/api/league` handler reads whichever pair is present, so you do not
   have to set them yourself. Note: the older `@vercel/kv` npm package is
   deprecated; this project uses `@upstash/redis` directly.
4. **Add the client env var**: Project &rarr; Settings &rarr; Environment
   Variables &rarr; add `VITE_USE_REMOTE=1` for the Production and Preview
   environments.
5. **Redeploy**. That's it &mdash; the badge in the top-right of the app
   will read "Shared &bull; synced" instead of "Local only".

To develop locally against the real KV instance, install the Vercel CLI,
run `vercel link`, then `vercel env pull .env.development.local` and
`vercel dev`. Without those, `npm run dev` uses the localStorage backend
so you don't need a database to iterate.

## Why Vercel KV (and not Postgres)

The whole "current game state" for one league is small &mdash; 21 players
&times; ~15 episodes &times; 15 event types &lt; 5 KB &mdash; and it
never needs joins, indexes, or partial updates. Storing it as a single
JSON blob under one Redis key means one `GET` per page load and one
`SET` per commit. If the league ever grows into multi-league or history
requirements, `src/data/storage.ts` is a clean seam to swap in Postgres
without touching UI code.
