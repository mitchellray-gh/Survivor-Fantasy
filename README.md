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

The app persists league state (player status, per-episode scoring events,
commissioner overrides, weekly predictions) behind a `StorageBackend`
interface in `src/data/storage.ts`. There are two implementations and the
app picks between them at build time:

| Backend               | When it's used                       | Where the data lives                              |
|-----------------------|--------------------------------------|---------------------------------------------------|
| `LocalStorageBackend` | `VITE_USE_REMOTE` is unset (default) | Browser `localStorage` (per-device)               |
| `RemoteBackend`       | `VITE_USE_REMOTE=1` at build time    | Vercel Postgres (Neon) via `/api/*` (shared)      |

Every mutation is a single POST to a purpose-built endpoint
(`/api/events`, `/api/players`, `/api/overrides`, `/api/predictions`),
which upserts one row. Reads happen once on load via `GET /api/state`.

### Serverless API surface

| Endpoint                        | Method | Body                                                         | What it does                             |
|---------------------------------|--------|--------------------------------------------------------------|------------------------------------------|
| `/api/state`                    | GET    | &mdash;                                                      | Full league state as JSON.               |
| `/api/events`                   | POST   | `{playerId, episode, categoryId, count}`                     | Upsert one scoring event (count=0 deletes). |
| `/api/players`                  | POST   | `{id, status?, managerName?}`                                | Update player status / manager.          |
| `/api/overrides`                | POST   | `{playerId, episode, delta, reason?}`                        | Set commissioner adjustment (delta=0 deletes). |
| `/api/predictions`              | POST   | `{manager, episode, categoryId, targetPlayerId?}`            | Save a pre-episode prediction.           |
| `/api/admin/init`               | POST   | &mdash;                                                      | Create schema and seed players/managers/categories. Idempotent. |
| `/api/admin/migrate-from-kv`    | POST   | &mdash;                                                      | One-shot copy of the old Upstash blob into Postgres. |

## Deploying to Vercel

1. **Push to GitHub** (already done for this repo).
2. In the Vercel dashboard: **Add New Project** &rarr; import this repo.
   Framework preset auto-detects as Vite.
3. **Add a Postgres store**: Project &rarr; Storage &rarr; **Marketplace**
   &rarr; add **Neon** (free tier available). Connect it to this project.
   Vercel auto-populates `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`,
   `POSTGRES_PRISMA_URL` etc. in the project environment &mdash; the
   `@vercel/postgres` client reads them automatically.
4. **Add the client env var**: Project &rarr; Settings &rarr; Environment
   Variables &rarr; add `VITE_USE_REMOTE=1` for Production and Preview.
5. **Deploy**.
6. **Initialize the database once**: after the first deploy finishes, hit
   `POST /api/admin/init` (from your browser dev tools, `curl`, or Postman).
   That creates all tables and seeds the roster / scoring categories from
   the TS source. It's idempotent, so you can re-run it whenever
   `src/data/players.ts` or `src/data/scoringRules.ts` changes and want
   the DB to catch up.
   ```bash
   curl -X POST https://<your-deployment>.vercel.app/api/admin/init
   ```
7. *(Optional)* If you have data in the old Upstash Redis blob, copy it
   over once by hitting `POST /api/admin/migrate-from-kv` while both the
   `POSTGRES_*` and `KV_REST_API_*` env vars are attached. After that
   you can safely remove the Upstash integration.

To develop locally against the real DB, install the Vercel CLI, run
`vercel link`, then `vercel env pull .env.development.local` and
`vercel dev`. Without those, `npm run dev` uses the localStorage backend
so you don't need a database to iterate.

## Data model

The Postgres schema (see `api/_schema.sql` / `api/_schema.ts`) is
relational so future features (multi-season, per-episode analysis,
predictions leaderboards) can just SQL against it:

- `managers(name, display_name, ...)`
- `players(id, name, ..., manager_name, status)` &mdash; status is
  `active | voted_out | medevac | quit | winner`.
- `scoring_categories(id, group, label, points, sort_order)`
- `episode_events(player_id, episode, category_id, count)`
- `score_overrides(player_id, episode, delta, reason)` &mdash;
  commissioner adjustments.
- `predictions(manager, episode, category_id, target_player_id, locked)`
- `meta(key, value)` &mdash; free-form key/value bag.
