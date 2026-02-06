// scripts/fetch-batman-odds.js
// Adapter stub for BatmanToto *official* API.
//
// I will NOT implement scraping or auth-bypass. This expects a documented API + key.
//
// Env:
//   BATMAN_API_URL   e.g. https://api.example.com
//   BATMAN_API_KEY   your key
//
// Output:
//   ./data/odds.json
//
// Usage:
//   node scripts/fetch-batman-odds.js

import fs from 'node:fs/promises';

const outPath = new URL('../data/odds.json', import.meta.url);

async function main() {
  const base = process.env.BATMAN_API_URL;
  const key = process.env.BATMAN_API_KEY;

  if (!base || !key) {
    console.error('Missing BATMAN_API_URL or BATMAN_API_KEY. See scripts/fetch-batman-odds.js');
    process.exit(2);
  }

  // TODO: replace with real endpoints once you share the official docs.
  // Example (placeholder):
  // const url = new URL('/v1/odds/1x2?league=EPL', base);
  // const res = await fetch(url, { headers: { 'Authorization': `Bearer ${key}` } });
  // const json = await res.json();

  const json = {
    meta: { source: 'batmantoto (placeholder)', updatedAt: new Date().toISOString() },
    odds: []
  };

  await fs.writeFile(outPath, JSON.stringify(json, null, 2), 'utf8');
  console.log(`Wrote ${outPath.pathname}`);
}

main().catch(e => { console.error(e); process.exit(1); });
