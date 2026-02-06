// scripts/build-ev.js
// Merge model predictions with odds (1x2) to compute implied probabilities and expected value.
// Inputs:
//   - ./data/predictions.json
//   - ./data/odds.json
// Output:
//   - ./data/ev.json
//
// Notes:
// - This is informational only; not betting advice.
// - EV uses decimal odds. For outcome o: EV = p(o) * odds(o) - 1
// - "Fair" probabilities are normalized implied probs from odds: 1/odds normalized.

import fs from 'node:fs/promises';

const predPath = new URL('../data/predictions.json', import.meta.url);
const oddsPath = new URL('../data/odds.json', import.meta.url);
const outPath = new URL('../data/ev.json', import.meta.url);

function normTeam(s) {
  return String(s || '').trim();
}

function keyOf({ date, home, away }) {
  return `${date}__${normTeam(home)}__${normTeam(away)}`;
}

function impliedProbs(odds) {
  const ih = 1 / odds.H;
  const id = 1 / odds.D;
  const ia = 1 / odds.A;
  const sum = ih + id + ia;
  return {
    H: ih / sum,
    D: id / sum,
    A: ia / sum,
    overround: sum
  };
}

function bestPickFromModel(poisson) {
  const opts = [
    { pick: 'H', p: poisson.pHome, oddsKey: 'H' },
    { pick: 'D', p: poisson.pDraw, oddsKey: 'D' },
    { pick: 'A', p: poisson.pAway, oddsKey: 'A' }
  ].sort((a, b) => b.p - a.p);
  return opts[0];
}

async function main() {
  const preds = JSON.parse(await fs.readFile(predPath, 'utf8'));

  let oddsData = null;
  try {
    oddsData = JSON.parse(await fs.readFile(oddsPath, 'utf8'));
  } catch {
    oddsData = { meta: { source: 'missing', updatedAt: new Date().toISOString() }, odds: [] };
  }

  const oddsMap = new Map();
  for (const o of oddsData.odds || []) {
    if (o.market !== '1x2') continue;
    const k = keyOf(o);
    oddsMap.set(k, {
      ...o,
      home: normTeam(o.home),
      away: normTeam(o.away)
    });
  }

  const rows = [];
  for (const m of preds.upcoming || []) {
    if (!m.poisson) continue;
    const k = keyOf(m);
    const o = oddsMap.get(k);
    if (!o) continue;

    const imp = impliedProbs(o);
    const pick = bestPickFromModel(m.poisson);

    const evH = m.poisson.pHome * o.H - 1;
    const evD = m.poisson.pDraw * o.D - 1;
    const evA = m.poisson.pAway * o.A - 1;

    const bestEv = [
      { pick: 'H', ev: evH, p: m.poisson.pHome, odds: o.H, imp: imp.H },
      { pick: 'D', ev: evD, p: m.poisson.pDraw, odds: o.D, imp: imp.D },
      { pick: 'A', ev: evA, p: m.poisson.pAway, odds: o.A, imp: imp.A }
    ].sort((a, b) => b.ev - a.ev)[0];

    rows.push({
      date: m.date,
      round: m.round,
      home: m.home,
      away: m.away,
      model: {
        pH: m.poisson.pHome,
        pD: m.poisson.pDraw,
        pA: m.poisson.pAway,
        xg: [m.poisson.lambdaHome, m.poisson.lambdaAway],
        ml: m.poisson.mostLikelyScore
      },
      odds: {
        book: o.book || null,
        H: o.H, D: o.D, A: o.A,
        implied: { H: imp.H, D: imp.D, A: imp.A },
        overround: imp.overround
      },
      picks: {
        modelTop: pick.pick,
        bestEV: bestEv
      }
    });
  }

  // default sort: highest EV first
  rows.sort((a, b) => b.picks.bestEV.ev - a.picks.bestEV.ev);

  const out = {
    meta: {
      baseDate: preds.baseDate,
      asOfDate: preds.asOfDate,
      generatedAt: new Date().toISOString(),
      oddsSource: oddsData.meta?.source || 'unknown',
      oddsUpdatedAt: oddsData.meta?.updatedAt || null,
      note: 'Informational only. EV computed from Poisson probabilities and decimal odds.'
    },
    rows: rows.slice(0, 50)
  };

  await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Wrote ${outPath.pathname} with ${out.rows.length} rows`);
}

main().catch(e => { console.error(e); process.exit(1); });
