// Local gate replica for token-radar-01: checks out/ the way the sealed scorer's gate does.
// Usage: node scripts/verify.mjs [outDir]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier } from '../vendor/makefun-board.ts';

const out = process.argv[2] ?? 'out';
const kitSnap = '../token-radar-01-kit/token-radar-01-kit/input/snapshot.json';
const snap = JSON.parse(readFileSync(kitSnap, 'utf8'));
const board = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8'));
const rows = board.rows;
const errs = [];

if (rows.length < 100 || rows.length > 4000) errs.push('row count ' + rows.length);
const slugs = new Set();
const known = new Set(snap.protocols.map((p) => p.slug));
let prev = Infinity;
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  if (r.rank !== i + 1) errs.push('rank ' + r.rank + ' at ' + (i + 1));
  if (slugs.has(r.slug)) errs.push('dup slug ' + r.slug);
  slugs.add(r.slug);
  if (!known.has(r.slug)) errs.push('unknown slug ' + r.slug);
  if (typeof r.name !== 'string' || r.name.length === 0) errs.push('empty name ' + r.slug);
  if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) errs.push('bad implied ' + r.slug);
  if (r.implied_value_usd > prev) errs.push('order break at ' + r.slug);
  prev = r.implied_value_usd;
  if (!Array.isArray(r.farm_steps) || r.farm_steps.length < 3 || r.farm_steps.length > 12) errs.push('steps count ' + r.slug);
  for (const s of r.farm_steps ?? []) if (typeof s !== 'string' || s.trim().length < 20 || s.trim().length > 600) errs.push('step len ' + s.length + ' ' + r.slug);
}
const missing = snap.watchlist.filter((s) => !slugs.has(s));
if (missing.length) errs.push('missing watchlist: ' + missing.join(','));
if (rows.length >= 2 && rows[0].implied_value_usd === rows[rows.length - 1].implied_value_usd) errs.push('all implied equal');
if (readFileSync(join(out, 'board.json')).length > 8 * 1024 * 1024) errs.push('board.json over 8 MiB');

const dfiles = readdirSync(join(out, 'dashboard'));
if (!dfiles.includes('index.html')) errs.push('no index.html');
if (!dfiles.some((f) => f.endsWith('.css'))) errs.push('no css');
if (!dfiles.some((f) => f.endsWith('.js'))) errs.push('no js');
if (dfiles.length > 400) errs.push('too many dashboard files');
let dtotal = 0;
for (const f of dfiles) {
  const st = statSync(join(out, 'dashboard', f));
  dtotal += st.size;
  if (!/^[A-Za-z0-9._-]+$/.test(f) || f.startsWith('.') || f.startsWith('-')) errs.push('bad dashboard name ' + f);
  const b = readFileSync(join(out, 'dashboard', f), 'utf8');
  if (/https?:\/\//.test(b)) errs.push('URL in dashboard file ' + f);
}
if (dtotal > 4 * 1024 * 1024) errs.push('dashboard over 4 MiB');
console.log('dashboard files:', dfiles.join(', '), 'total bytes:', dtotal);

for (const f of readdirSync(join(out, 'screenshots'))) {
  const st = statSync(join(out, 'screenshots', f));
  console.log('shot', f, st.size, 'bytes');
  if (st.size > 524288) errs.push('shot too big ' + f);
  if (!/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(f)) errs.push('bad shot name ' + f);
}

const rebuilt = Buffer.from(buildDossier(out, { text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524288 }, dashboard: { max_files: 400, max_bytes: 4194304 } }));
const written = readFileSync(join(out, 'dossier.json'));
console.log('dossier bytes:', written.length, 'rebuild match:', Buffer.compare(rebuilt, written) === 0 ? 'YES' : 'NO');
if (Buffer.compare(rebuilt, written) !== 0) errs.push('dossier mismatch');
const dos = JSON.parse(written.toString());
console.log('dossier text bytes:', Buffer.byteLength(dos.text), 'images:', dos.images.length, 'cover:', dos.cover);
if (Buffer.byteLength(dos.text) > 65536) errs.push('dossier text over cap');
if (written.length > 1.5 * 1024 * 1024) errs.push('dossier over 1.5 MiB');

console.log('top5:', rows.slice(0, 5).map((r) => r.rank + '. ' + r.name + ' $' + r.implied_value_usd.toLocaleString()).join(' | '));
console.log('bottom:', rows[rows.length - 1].name, rows[rows.length - 1].implied_value_usd);
console.log('board.json bytes:', readFileSync(join(out, 'board.json')).length, 'data.js bytes:', readFileSync(join(out, 'data.js')).length);
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'ALL GATE CHECKS PASS');
process.exit(errs.length ? 1 : 0);
