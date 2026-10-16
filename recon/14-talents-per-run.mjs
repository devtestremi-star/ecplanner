// Le grain de l'association personnage × run × spec : les talents varient-ils
// entre deux runs d'un même rapport ?
//
// Si oui, une ternaire (personnage, RAPPORT, spec) écraserait de l'information —
// il faut le grain RUN. CombatantInfo étant émis par fight, l'hypothèse est qu'ils varient.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gql, dump, DUMP_DIR } from './wcl.mjs';

const report = JSON.parse(await readFile(join(DUMP_DIR, '01-fights.json'), 'utf8'));

const QUERY = `query ($c: String!, $s: Float!, $e: Float!) {
  reportData { report(code: $c) {
    events(startTime: $s, endTime: $e, dataType: CombatantInfo, limit: 50) { data }
  } }
}`;

const h = (s) => (s.length ? createHash('md5').update(s).digest('hex').slice(0, 8) : 'vide');
const PROBE = [1, 3, 4, 9]; // 2 donjons différents, 4 runs

const per = {};
for (const fid of PROBE) {
  const f = report.fights.find((x) => x.id === fid);
  const res = await gql(QUERY, { c: report.code, s: f.startTime, e: f.endTime });
  for (const e of res.data.reportData.report.events.data) {
    const tree = e.talentTree ?? [];
    (per[e.sourceID] ??= {})[fid] = {
      specID: e.specID,
      n: tree.length,
      talents: h(tree.map((t) => `${t.id}:${t.rank}`).sort().join(',')),
      gear: h((e.gear ?? []).map((g) => `${g.id}@${g.itemLevel}`).join('|')),
      ilvl: Math.round((e.gear ?? []).reduce((s, g) => s + (g.itemLevel ?? 0), 0) / Math.max(1, (e.gear ?? []).length)),
    };
  }
}

const col = (v) => String(v ?? '-').padEnd(11);
console.log(`Rapport ${report.code} — runs ${PROBE.join(', ')}\n`);
console.log('  src | ' + PROBE.map((f) => col('f' + f + ' talents')).join('| ') + '| verdict');
console.log('  ----|-' + PROBE.map(() => '-'.repeat(12)).join('|-') + '|--------');

const summary = [];
for (const [src, v] of Object.entries(per).sort((a, b) => a[0] - b[0])) {
  const seen = PROBE.map((f) => v[f]?.talents).filter(Boolean);
  const stable = new Set(seen).size === 1;
  summary.push({ sourceID: +src, stable, perFight: v });
  console.log(
    `   ${String(src).padStart(2)} | ` +
      PROBE.map((f) => col(v[f] ? `${v[f].talents}(${v[f].n})` : null)).join('| ') +
      `| ${stable ? 'identiques' : '⚠️  CHANGENT'}`
  );
}

const gearMoved = Object.entries(per).filter(
  ([, v]) => new Set(PROBE.map((f) => v[f]?.gear).filter(Boolean)).size > 1
);
const talentsMoved = summary.filter((s) => !s.stable);

console.log(`\nTalents : ${talentsMoved.length}/${summary.length} joueurs changent entre ces runs`);
console.log(`Gear    : ${gearMoved.length}/${summary.length} joueurs changent entre ces runs`);
console.log(`
Lecture :
  - talents identiques sur CE rapport ne prouve pas qu'ils sont stables en général —
    CombatantInfo est émis par fight, donc l'API modélise bien une valeur par run.
  - une ternaire (personnage, RAPPORT, spec) ne pourrait en stocker qu'une seule.
    Le grain RUN est le seul qui ne perde rien.
`);

await dump('14-talents-per-run', { probe: PROBE, per, talentsMoved: talentsMoved.length, gearMoved: gearMoved.length });
