// Question ouverte : le `limit` s'applique-t-il aux events RETOURNÉS (après filtrage)
// ou aux events SCANNÉS (avant) ?
//
// L'enjeu est direct sur le coût : si limit = post-filtre, un filtre serré réduit le nombre
// de pages et donc les points. Si limit = pré-filtre, filtrer ne change RIEN au nombre de
// pages — on paie la même chose et le filtre n'économise que de la bande passante.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gql, dump, logRate, DUMP_DIR } from './wcl.mjs';

const report = JSON.parse(await readFile(join(DUMP_DIR, '01-fights.json'), 'utf8'));
const f3 = report.fights.find((f) => f.id === 3);

const QUERY = `query ($c: String!, $s: Float!, $e: Float!, $f: String, $l: Int) {
  reportData { report(code: $c) {
    events(startTime: $s, endTime: $e, dataType: Casts, hostilityType: Friendlies, limit: $l, filterExpression: $f) {
      data nextPageTimestamp
    }
  } }
}`;

async function walk(label, filter, limit) {
  const pages = [];
  let cursor = f3.startTime;
  let total = 0;
  let cost = 0;

  while (pages.length < 25) {
    const res = await gql(QUERY, { c: report.code, s: cursor, e: f3.endTime, f: filter, l: limit });
    if (res.cost !== null) cost += res.cost;
    const ev = res.data.reportData.report.events;
    const n = ev.data.length;
    total += n;

    // Fenêtre temporelle réellement couverte par la page : indice décisif.
    const first = ev.data[0]?.timestamp ?? null;
    const last = ev.data[n - 1]?.timestamp ?? null;
    pages.push({
      page: pages.length + 1,
      count: n,
      fromCursor: cursor,
      firstTs: first,
      lastTs: last,
      spanS: first != null ? +((last - first) / 1000).toFixed(1) : null,
      nextPageTimestamp: ev.nextPageTimestamp ?? null,
    });

    if (ev.nextPageTimestamp == null) break;
    if (ev.nextPageTimestamp <= cursor) throw new Error('curseur non progressif');
    cursor = ev.nextPageTimestamp;
  }

  console.log(`\n=== ${label} ===`);
  console.log(`    filtre : ${filter ?? '(aucun)'} | limit=${limit}`);
  for (const p of pages) {
    console.log(
      `    page ${p.page}: ${String(p.count).padStart(6)} events | ts ${p.firstTs}→${p.lastTs} (${p.spanS}s couverts) | next=${p.nextPageTimestamp ?? 'null (fin)'}`
    );
  }
  console.log(`    → ${total} events en ${pages.length} page(s), ${cost.toFixed(2)} pts`);
  return { label, filter, limit, total, pages: pages.length, cost, detail: pages };
}

const runDurS = ((f3.endTime - f3.startTime) / 1000).toFixed(0);
console.log(`Fenêtre: fight 3, ${runDurS}s, ts ${f3.startTime} → ${f3.endTime}`);

const results = [];
results.push(await walk('A. sans filtre, limit 10000', null, 10000));
results.push(await walk('B. type="cast", limit 10000', 'type = "cast"', 10000));
results.push(await walk('C. 3 spells DK, limit 10000', 'type = "cast" and ability.id in (42650, 1233448, 48707)', 10000));
results.push(await walk('D. 3 spells DK, limit 100', 'type = "cast" and ability.id in (42650, 1233448, 48707)', 100));
results.push(await walk('E. sans filtre, limit 100', null, 100));

await dump('09-pagination', results);

console.log(`\n${'='.repeat(72)}`);
console.log('VERDICT — limit post-filtre ou pré-filtre ?');
console.log('='.repeat(72));
for (const r of results) {
  console.log(`  ${r.label.padEnd(32)} → ${String(r.total).padStart(6)} events | ${r.pages} page(s) | ${r.cost.toFixed(2)} pts`);
}

const a = results[0], c = results[2];
console.log(`
Lecture :
  - Si C (76 events) tient en 1 page alors que A (13902) en prend ${a.pages},
    le limit est POST-filtre → filtrer réduit les pages, donc les points.
  - Si C prend autant de pages que A malgré ses 76 events,
    le limit est PRÉ-filtre → filtrer n'économise aucun point.
  - Comparer aussi les "spanS" : une page post-filtre couvre une fenêtre temporelle
    plus large quand le filtre est serré.
`);
