// scripts/build-toto.js
// Build model-based "combo" recommendations from predictions.json.
// Output: ./data/toto.json
//
// This is informational only (not betting advice).
//
// Usage:
//   node scripts/build-toto.js --days 7

import fs from 'node:fs/promises';

const predPath = new URL('../data/predictions.json', import.meta.url);
const outPath = new URL('../data/toto.json', import.meta.url);

function getArg(name, def) {
  const i = process.argv.indexOf(name);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v ?? def;
}

const days = Number(getArg('--days', '7'));

function combos(n, k) {
  const out = [];
  function rec(start, chosen) {
    if (chosen.length === k) { out.push([...chosen]); return; }
    for (let i = start; i <= n - (k - chosen.length); i++) {
      chosen.push(i);
      rec(i + 1, chosen);
      chosen.pop();
    }
  }
  rec(0, []);
  return out;
}

function topPicks(pred, windowDays) {
  const start = pred.baseDate;
  const startMs = Date.parse(start + 'T00:00:00Z');
  const endMs = startMs + windowDays * 24 * 3600 * 1000;

  const inWindow = pred.upcoming
    .filter(x => x.poisson)
    .filter(x => {
      const ms = Date.parse(x.date + 'T00:00:00Z');
      return ms >= startMs && ms < endMs;
    });

  const picks = inWindow.map(x => {
    const pr = x.poisson;
    const opts = [
      { k: 'H', v: pr.pHome },
      { k: 'D', v: pr.pDraw },
      { k: 'A', v: pr.pAway }
    ].sort((a, b) => b.v - a.v);

    const best = opts[0];
    return {
      date: x.date,
      round: x.round,
      home: x.home,
      away: x.away,
      match: `${x.home} vs ${x.away}`,
      pick: best.k,
      prob: best.v,
      xg: [pr.lambdaHome, pr.lambdaAway],
      ml: pr?.mostLikelyScore ? `${pr.mostLikelyScore.home}-${pr.mostLikelyScore.away}` : '-'
    };
  }).sort((a, b) => b.prob - a.prob);

  return { start, windowDays, count: picks.length, picks };
}

function bestCombo(picks, K, poolN = 12) {
  const base = picks.slice(0, Math.min(poolN, picks.length));
  if (base.length < K) return null;

  // Exact up to K<=6; greedy above.
  if (K > 6) {
    let prod = 1;
    for (let i = 0; i < K; i++) prod *= base[i].prob;
    return { jointProb: prod, games: base.slice(0, K) };
  }

  let best = null;
  for (const arr of combos(base.length, K)) {
    let prod = 1;
    for (const i of arr) prod *= base[i].prob;
    if (!best || prod > best.prod) best = { arr, prod };
  }

  return { jointProb: best.prod, games: best.arr.map(i => base[i]) };
}

async function main() {
  const pred = JSON.parse(await fs.readFile(predPath, 'utf8'));
  const w = topPicks(pred, days);

  const ks = [2,3,4,5,6,7,8,9,10];
  const out = {
    meta: {
      baseDate: pred.baseDate,
      asOfDate: pred.asOfDate,
      windowDays: days,
      generatedAt: new Date().toISOString(),
      note: 'Informational only. Joint prob is a naive product (independence assumption).'
    },
    topPicks: w.picks.slice(0, 12),
    combos: {}
  };

  for (const K of ks) {
    const b = bestCombo(w.picks, K);
    if (b) out.combos[String(K)] = b;
  }

  await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Wrote ${outPath.pathname}`);
}

main().catch(e => { console.error(e); process.exit(1); });
