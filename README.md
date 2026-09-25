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

## Persistence

Vote-outs and per-episode scoring events are saved to `localStorage` under
the key `survivor_fantasy_state_v1`. Clear that key in DevTools to reset.
