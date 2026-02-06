// scripts/build-predictions.js
// Build match predictions (Elo + simple Poisson goals model) from ./data/epl.json
// Writes: ./data/predictions.json
//
// Usage:
//   node scripts/build-predictions.js

import fs from 'node:fs/promises';

const eplPath = new URL('../data/epl.json', import.meta.url);
const outPath = new URL('../data/predictions.json', import.meta.url);

function poissonP(lambda, k) {
  // P(X=k) for Poisson(lambda)
  // stable enough for small k.
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function normTeam(name) { return String(name || '').trim(); }

function isPlayed(m) {
  return Number.isFinite(m.homeGoals) && Number.isFinite(m.awayGoals);
}

function parseDate(s) {
  // treat as local-less YYYY-MM-DD
  return new Date(`${s}T00:00:00Z`).getTime();
}

function computeElo(matches, { k = 20, homeAdv = 60, base = 1500 } = {}) {
  const elo = new Map();
  const ensure = (t) => {
    if (!elo.has(t)) elo.set(t, base);
    return elo.get(t);
  };

  const played = matches.filter(isPlayed).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  for (const m of played) {
    const home = normTeam(m.home);
    const away = normTeam(m.away);
    let Rh = ensure(home);
    let Ra = ensure(away);

    const diff = (Rh + homeAdv) - Ra;
    const Eh = 1 / (1 + Math.pow(10, (-diff / 400)));

    const Sh = m.homeGoals > m.awayGoals ? 1 : m.homeGoals < m.awayGoals ? 0 : 0.5;

    Rh = Rh + k * (Sh - Eh);
    Ra = Ra + k * ((1 - Sh) - (1 - Eh));

    elo.set(home, Rh);
    elo.set(away, Ra);
  }

  return { elo, k, homeAdv, base };
}

function computePoissonStrengths(matches, { priorGames = 6, priorGoals = 8 } = {}) {
  // Estimate home/away attack + defense multipliers from played matches only.
  // Smoothing: add priorGoals over priorGames.
  const teams = new Set();
  let totalHomeGF = 0, totalAwayGF = 0, n = 0;

  const agg = new Map();
  const ensure = (t) => {
    if (!agg.has(t)) agg.set(t, {
      homeGF: 0, homeGA: 0, homeP: 0,
      awayGF: 0, awayGA: 0, awayP: 0
    });
    return agg.get(t);
  };

  for (const m of matches) {
    if (!isPlayed(m)) continue;
    const h = normTeam(m.home);
    const a = normTeam(m.away);
    teams.add(h); teams.add(a);

    const H = ensure(h);
    const A = ensure(a);

    H.homeP++; A.awayP++;
    H.homeGF += m.homeGoals; H.homeGA += m.awayGoals;
    A.awayGF += m.awayGoals; A.awayGA += m.homeGoals;

    totalHomeGF += m.homeGoals;
    totalAwayGF += m.awayGoals;
    n++;
  }

  const leagueAvgHome = n ? totalHomeGF / n : 1.4;
  const leagueAvgAway = n ? totalAwayGF / n : 1.2;

  const strengths = new Map();
  for (const t of teams) {
    const x = ensure(t);

    const homeP = x.homeP + priorGames;
    const awayP = x.awayP + priorGames;

    const homeGFpg = (x.homeGF + priorGoals) / homeP;
    const homeGApg = (x.homeGA + priorGoals) / homeP;
    const awayGFpg = (x.awayGF + priorGoals) / awayP;
    const awayGApg = (x.awayGA + priorGoals) / awayP;

    const attackHome = homeGFpg / leagueAvgHome;
    const defenseHome = homeGApg / leagueAvgAway;
    const attackAway = awayGFpg / leagueAvgAway;
    const defenseAway = awayGApg / leagueAvgHome;

    strengths.set(t, { attackHome, defenseHome, attackAway, defenseAway });
  }

  return { strengths, leagueAvgHome, leagueAvgAway };
}

function predictPoisson(home, away, strengths, leagueAvgHome, leagueAvgAway, maxGoals = 6) {
  const h = strengths.get(home);
  const a = strengths.get(away);
  if (!h || !a) return null;

  const lambdaHome = leagueAvgHome * h.attackHome * a.defenseAway;
  const lambdaAway = leagueAvgAway * a.attackAway * h.defenseHome;

  let pHome = 0, pDraw = 0, pAway = 0;
  let best = { hg: 0, ag: 0, p: 0 };

  for (let hg = 0; hg <= maxGoals; hg++) {
    const ph = poissonP(lambdaHome, hg);
    for (let ag = 0; ag <= maxGoals; ag++) {
      const pa = poissonP(lambdaAway, ag);
      const p = ph * pa;
      if (p > best.p) best = { hg, ag, p };
      if (hg > ag) pHome += p;
      else if (hg < ag) pAway += p;
      else pDraw += p;
    }
  }

  // Some probability mass is beyond maxGoals; renormalize.
  const sum = pHome + pDraw + pAway;
  if (sum > 0) {
    pHome /= sum; pDraw /= sum; pAway /= sum;
  }

  return {
    lambdaHome,
    lambdaAway,
    pHome,
    pDraw,
    pAway,
    mostLikelyScore: { home: best.hg, away: best.ag, p: best.p }
  };
}

function predictElo(home, away, eloModel) {
  const Rh = eloModel.elo.get(home) ?? eloModel.base;
  const Ra = eloModel.elo.get(away) ?? eloModel.base;
  const diff = (Rh + eloModel.homeAdv) - Ra;
  const pHomeWin = 1 / (1 + Math.pow(10, (-diff / 400)));

  // Draw probability is not defined in standard Elo.
  // Use a conservative heuristic that shrinks with rating gap.
  const gap = Math.abs(diff);
  const pDraw = clamp01(0.28 - (gap / 1200) * 0.18); // ~0.28 near equal, down to ~0.10 for big gaps

  const pHome = pHomeWin * (1 - pDraw);
  const pAway = (1 - pHomeWin) * (1 - pDraw);

  return { pHome, pDraw, pAway, diff, Rh, Ra };
}

async function main() {
  const raw = await fs.readFile(eplPath, 'utf8');
  const data = JSON.parse(raw);
  const matches = (data.matches || []).map(m => ({
    date: m.date,
    home: normTeam(m.home),
    away: normTeam(m.away),
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    round: m.round ?? null
  }));

  const eloModel = computeElo(matches);
  const pois = computePoissonStrengths(matches);

  const upcoming = matches
    .filter(m => m.date && !isPlayed(m))
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map(m => {
      const home = m.home, away = m.away;
      const pe = predictElo(home, away, eloModel);
      const pp = predictPoisson(home, away, pois.strengths, pois.leagueAvgHome, pois.leagueAvgAway);
      return {
        date: m.date,
        round: m.round,
        home, away,
        elo: pe,
        poisson: pp
      };
    });

  const out = {
    season: data.season,
    updatedAt: new Date().toISOString(),
    source: data.source,
    model: {
      elo: { k: eloModel.k, homeAdv: eloModel.homeAdv, base: eloModel.base },
      poisson: { leagueAvgHome: pois.leagueAvgHome, leagueAvgAway: pois.leagueAvgAway, maxGoals: 6 }
    },
    upcoming
  };

  await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Wrote ${outPath.pathname} with ${upcoming.length} upcoming matches`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
