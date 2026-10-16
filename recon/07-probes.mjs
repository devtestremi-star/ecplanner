// Sondes complémentaires nées des dumps précédents :
//  A) CombatantInfo est-il réémis à chaque fight, ou seulement au début du rapport ?
//     → détermine si `talents` peut varier entre deux runs d'un même rapport (§5).
//  B) Les pets/totems émettent-ils des events Casts ? (piège #6, pire mode d'échec)
//  C) Les boss sont-ils bornables par les fenêtres des dungeonPulls ?

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gql, dump, logRate, DUMP_DIR } from './wcl.mjs';

const report = JSON.parse(await readFile(join(DUMP_DIR, '01-fights.json'), 'utf8'));
const f3 = report.fights.find((f) => f.id === 3);

const results = {};

// --- A ---
const qCI = `query ($c: String!, $s: Float!, $e: Float!) {
  reportData { report(code: $c) {
    events(startTime: $s, endTime: $e, dataType: CombatantInfo, limit: 100) { data }
  } }
}`;
const a = await gql(qCI, { c: report.code, s: f3.startTime, e: f3.endTime });
logRate('CombatantInfo sur fight 3', a.rate, a.cost);
const ci = a.data.reportData.report.events.data;
results.combatantInfoOnFight3 = {
  count: ci.length,
  fights: [...new Set(ci.map((e) => e.fight))],
  sourceIDs: [...new Set(ci.map((e) => e.sourceID))],
};
console.log(
  `  → ${ci.length} events | fights: ${JSON.stringify(results.combatantInfoOnFight3.fights)} | sourceIDs: ${JSON.stringify(results.combatantInfoOnFight3.sourceIDs)}`
);

// --- B ---
const qCasts = `query ($c: String!, $s: Float!, $e: Float!, $f: String) {
  reportData { report(code: $c) {
    events(startTime: $s, endTime: $e, dataType: Casts, hostilityType: Friendlies, limit: 10000, filterExpression: $f) {
      data nextPageTimestamp
    }
  } }
}`;

results.petProbes = [];
for (const expr of ['source.type = "Pet"', 'type = "cast" and source.id > 5', 'source.disposition = "friendly"']) {
  try {
    const b = await gql(qCasts, { c: report.code, s: f3.startTime, e: f3.endTime, f: expr });
    const d = b.data.reportData.report.events.data;
    const srcs = [...new Set(d.map((e) => e.sourceID))].sort((x, y) => x - y);
    console.log(`  filtre [${expr}] → ${d.length} events | sourceIDs ${JSON.stringify(srcs.slice(0, 20))}`);
    results.petProbes.push({ expr, count: d.length, sourceIDs: srcs.slice(0, 20) });
  } catch (err) {
    console.log(`  filtre [${expr}] → ERREUR: ${err.message.split('\n')[0].slice(0, 120)}`);
    results.petProbes.push({ expr, error: err.message.split('\n')[0] });
  }
}

// --- C : répartir les casts déjà dumpés dans les fenêtres de dungeonPulls ---
const base = JSON.parse(await readFile(join(DUMP_DIR, '03-events-nofilter.json'), 'utf8'));
const casts = base.events.filter((e) => e.type === 'cast');
const bosses = f3.dungeonPulls.filter((p) => p.encounterID !== 0);

console.log(`\nRépartition des ${casts.length} casts dans les ${bosses.length} fenêtres de boss :`);
let inBoss = 0;
results.bossWindows = [];
for (const [i, p] of bosses.entries()) {
  const n = casts.filter((e) => e.timestamp >= p.startTime && e.timestamp <= p.endTime).length;
  inBoss += n;
  const row = {
    orderIndex: i,
    pullId: p.id,
    encounterID: p.encounterID,
    name: p.name,
    offsetRunS: +((p.startTime - f3.startTime) / 1000).toFixed(1),
    durationS: +((p.endTime - p.startTime) / 1000).toFixed(1),
    casts: n,
  };
  results.bossWindows.push(row);
  console.log(
    `  #${i} pull ${String(p.id).padStart(2)} enc ${p.encounterID} "${p.name}" | +${row.offsetRunS}s | ${row.durationS}s | ${n} casts`
  );
}
console.log(`  → ${inBoss} casts en combat de boss, ${casts.length - inBoss} hors boss (trash/route)`);
results.castsInBoss = inBoss;
results.castsTotal = casts.length;

await dump('07-probes', results);
