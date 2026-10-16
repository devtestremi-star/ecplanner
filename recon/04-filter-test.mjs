// Phase 0, points 6 et 11 : TEST DE NON-RÉGRESSION du filterExpression.
//
// « Si le nombre d'events est identique avec et sans filtre, le filtre ne s'applique pas
//   et échoue silencieusement. » (§2.2.3, piège #7)
//
// Ce script ne suppose aucune syntaxe : il en essaie plusieurs et compare les volumes
// au dump non filtré de 03-events.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dump, DUMP_DIR } from './wcl.mjs';
import { fetchAllEvents } from './events.mjs';

let baseline;
try {
  baseline = JSON.parse(await readFile(join(DUMP_DIR, '03-events-nofilter.json'), 'utf8'));
} catch {
  console.error("Lance d'abord recon/03-events.mjs — ce script compare à son dump.");
  process.exit(1);
}

const reportCode = process.argv[2] ?? process.env.WCL_TEST_REPORT;
const code = /^[a-zA-Z0-9]{16}$/.test(reportCode ?? '') ? reportCode : new URL(reportCode).pathname.match(/\/reports\/([a-zA-Z0-9]+)/)[1];

const { fight, events: rawBaseline } = baseline;
const baseCount = rawBaseline.length;
const baseCastCount = rawBaseline.filter((e) => e.type === 'cast').length;

// On prend 3 abilityGameID réellement présents : un filtre correct doit rendre
// exactement le nombre d'occurrences déjà compté hors-ligne.
const counts = new Map();
for (const e of rawBaseline) {
  if (e.type !== 'cast') continue;
  counts.set(e.abilityGameID, (counts.get(e.abilityGameID) ?? 0) + 1);
}
const probes = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3);
const probeIds = probes.map(([id]) => id);
const expectedForProbes = probes.reduce((n, [, c]) => n + c, 0);

console.log(`Baseline (03-events, sans filtre): ${baseCount} events, dont ${baseCastCount} type='cast'`);
console.log(`Sondes: ${probes.map(([id, n]) => `${id}(×${n})`).join(', ')} → attendu ${expectedForProbes} events\n`);

const idList = probeIds.join(', ');

const candidates = [
  { name: 'type-cast-seul', expr: `type = "cast"`, expected: baseCastCount },
  { name: 'type-cast-quotes-simples', expr: `type = 'cast'`, expected: baseCastCount },
  { name: 'ability-in-liste', expr: `ability.id in (${idList})`, expected: null },
  { name: 'combine-type-et-ability', expr: `type = "cast" and ability.id in (${idList})`, expected: expectedForProbes },
  { name: 'abilityGameID-nom-alternatif', expr: `type = "cast" and abilityGameID in (${idList})`, expected: expectedForProbes },
  // Point 6 §2.2 : longueur maximale. 300 ids bidons + les sondes réelles.
  {
    name: 'liste-longue-300-ids',
    expr: `type = "cast" and ability.id in (${[...probeIds, ...Array.from({ length: 300 }, (_, i) => 900000 + i)].join(', ')})`,
    expected: expectedForProbes,
  },
];

const results = [];

for (const c of candidates) {
  process.stdout.write(`\n--- ${c.name} ---\n    ${c.expr.slice(0, 140)}${c.expr.length > 140 ? `… (${c.expr.length} car.)` : ''}\n`);
  try {
    const { events, cost } = await fetchAllEvents({
      reportCode: code,
      startTime: fight.startTime,
      endTime: fight.endTime,
      filter: c.expr,
      label: c.name,
    });

    let verdict;
    if (events.length === baseCount) {
      verdict = '❌ SILENCIEUX — volume identique au non-filtré, le filtre ne s\'applique pas';
    } else if (c.expected != null && events.length === c.expected) {
      verdict = '✅ EXACT — volume conforme au compte hors-ligne';
    } else if (c.expected != null) {
      verdict = `⚠️  filtre actif mais volume inattendu (attendu ${c.expected})`;
    } else {
      verdict = 'ℹ️  filtre actif (pas d\'attendu calculable)';
    }

    console.log(`    → ${events.length} events | coût ${cost.toFixed(2)} | ${verdict}`);
    results.push({ ...c, count: events.length, cost, verdict, ok: !verdict.startsWith('❌') });
  } catch (err) {
    console.log(`    → ERREUR: ${err.message.split('\n')[0]}`);
    console.log('       (une erreur explicite vaut mieux qu\'un filtre silencieux — syntaxe rejetée)');
    results.push({ ...c, error: err.message, ok: false });
  }
}

await dump('04-filter-test', { baseCount, baseCastCount, probes, results });

console.log(`\n=== SYNTHÈSE ===`);
for (const r of results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}: ${r.error ? 'erreur' : `${r.count} events`} — ${r.verdict ?? r.error?.split('\n')[0]}`);
}

const usable = results.filter((r) => r.ok && r.verdict?.startsWith('✅'));
console.log(`
CONCLUSION à noter dans NOTES.md :
  - syntaxe retenue : ${usable.length ? usable.map((r) => r.name).join(' | ') : 'AUCUNE — filtrer est impossible, tout stocker devient obligatoire'}
  - la liste de 300 ids passe-t-elle ? → borne pratique du §2.2.6
  - gain en points du filtre vs non filtré : comparer les coûts ci-dessus
`);
