# EPL Lab

A lightweight EPL-focused football analysis site.

## MVP (what’s included)

- Static website (no backend)
- Loads `data/epl.json` (fixtures/results) and computes the table + form
- Builds `data/predictions.json` with simple **match predictions**:
  - Elo (W/D/L, heuristic draw)
  - Poisson goals model (W/D/L + most likely scoreline)
- Team page: recent matches + next-5 predictions
- Upcoming fixtures: top 25 predictions
- Free data source: OpenFootball

## Run locally

```bash
# refresh data + predictions
npm run refresh

# serve the static site
npx --yes serve -l 5173 -s site
```

Open: http://localhost:5173

## Data format

The site expects `data/epl.json` shaped like:

```json
{
  "season": "2025-26",
  "updatedAt": "2026-02-06T12:00:00Z",
  "matches": [
    {
      "date": "2026-02-01",
      "home": "Arsenal",
      "away": "Chelsea",
      "homeGoals": 2,
      "awayGoals": 1
    }
  ]
}
```

## Next steps (recommended)

1) Pick a data source for EPL fixtures/results
   - free/open dataset (best for MVP)
   - paid API later if you want full stats
2) Add xG/shots maps once you have event data
3) Deploy via GitHub Pages

---

If you tell me which data source you want to use (free dataset vs API), I’ll wire the updater so it auto-refreshes and the site stays current.
