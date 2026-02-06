// scripts/copy-site-data.js
// Copy generated data files into site/ so static hosting works with `serve -s site`.

import fs from 'node:fs/promises';
import path from 'node:path';

const root = new URL('../', import.meta.url);
const dataDir = new URL('../data/', import.meta.url);
const siteDataDir = new URL('../site/data/', import.meta.url);

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function copyFile(name) {
  const src = new URL(name, dataDir);
  const dst = new URL(name, siteDataDir);
  await fs.copyFile(src, dst);
}

async function main() {
  await ensureDir(siteDataDir);
  await copyFile('epl.json');
  await copyFile('predictions.json');
  // optional
  try { await copyFile('toto.json'); } catch {}
  try { await copyFile('odds.json'); } catch {}
  try { await copyFile('ev.json'); } catch {}
  console.log('Copied data/*.json -> site/data/*.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
