// scripts/update-data.js
// Fetch EPL fixtures/results from OpenFootball (free dataset) and write ./data/epl.json
//
// Data source:
//   https://github.com/openfootball/football.json
// File:
//   2025-26/en.1.json (Premier League)
//
// Usage:
//   node scripts/update-data.js

import fs from 'node:fs/promises';

const SOURCE_URL = 'https://raw.githubusercontent.com/openfootball/football.json/master/2025-26/en.1.json';
const outPath = new URL('../data/epl.json', import.meta.url);

function normalizeTeam(name) {
  // Keep it simple: remove common suffixes.
  // OpenFootball uses e.g. "Liverpool FC", "Aston Villa FC".
  return String(name)
    .replace(/^AFC\s+/i, '')
    .replace(/^FC\s+/i, '')
    .replace(/\s+FC$/i, '')
    .replace(/\s+AFC$/i, '')
    .replace(/\s+CF$/i, '')
    .replace(/\s+SC$/i, '')
    .trim();
}

function matchToOut(m) {
  const ft = m?.score?.ft;
  const hasScore = Array.isArray(ft) && ft.length === 2 && Number.isFinite(ft[0]) && Number.isFinite(ft[1]);

  return {
    date: m.date,
    home: normalizeTeam(m.team1),
    away: normalizeTeam(m.team2),
    homeGoals: hasScore ? ft[0] : null,
    awayGoals: hasScore ? ft[1] : null,
    round: m.round ?? null
  };
}

async function main() {
  const res = await fetch(SOURCE_URL, {
    headers: {
      'user-agent': 'epl-lab (https://github.com/urgot113)'
    }
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);

  const src = await res.json();

  const matches = (src.matches || []).map(matchToOut);

  const out = {
    season: src.name || 'EPL',
    updatedAt: new Date().toISOString(),
    source: SOURCE_URL,
    matches
  };

  await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Wrote ${outPath.pathname} with ${matches.length} matches`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
