// Phase 0, point 7 : format des talents dans CombatantInfo.
// « La représentation a changé plusieurs fois côté Blizzard. Dumper avant de dessiner
//   le schéma. » (§2.2.4)

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gql, dump, logRate, DUMP_DIR } from './wcl.mjs';

let report;
try {
  report = JSON.parse(await readFile(join(DUMP_DIR, '01-fights.json'), 'utf8'));
} catch {
  console.error("Lance d'abord recon/01-fights.mjs.");
  process.exit(1);
}

const target =
  report.fights.filter((f) => f.keystoneLevel != null)[0] ??
  report.fights.find((f) => f.encounterID !== 0);
if (!target) throw new Error('Aucun fight exploitable.');

const query = `query ($code: String!, $start: Float!, $end: Float!) {
  reportData {
    report(code: $code) {
      events(startTime: $start, endTime: $end, dataType: CombatantInfo, limit: 100) {
        data
        nextPageTimestamp
      }
    }
  }
}`;

const { data, rate, cost } = await gql(query, {
  code: report.code,
  start: target.startTime,
  end: target.endTime,
});
logRate('CombatantInfo', rate, cost);

const events = data.reportData.report.events.data;
await dump('05-combatantinfo', events);

console.log(`\n${events.length} events CombatantInfo (attendu: un par joueur au pull).`);
if (!events.length) {
  console.log('⚠️  Zéro. CombatantInfo est parfois émis uniquement au tout début du rapport —');
  console.log('    réessayer avec la fenêtre complète (report.startTime → report.endTime).');
  process.exit(0);
}

const first = events[0];
console.log('\nChamps de premier niveau :', Object.keys(first).join(', '));

for (const key of ['talents', 'talentTree', 'heartOfAzeroth', 'artifact', 'gear', 'auras', 'customPowerSet', 'pvpTalents']) {
  if (!(key in first)) continue;
  const v = first[key];
  console.log(`\n--- ${key} (${Array.isArray(v) ? `array[${v.length}]` : typeof v}) ---`);
  console.log(JSON.stringify(Array.isArray(v) ? v.slice(0, 3) : v, null, 2).slice(0, 1200));
}

console.log(`\nsourceID présents : ${events.map((e) => e.sourceID).join(', ')}`);
console.log(`
À NOTER dans NOTES.md :
  - forme exacte des talents (liste d'ids ? arbre ? chaîne encodée Blizzard ?)
  - un CombatantInfo par joueur et par fight, ou seulement au début du rapport ?
  - le sourceID d'ici recoupe-t-il celui de playerDetails et des events ?
  → détermine le type de FightParticipant.talents (Json?) dans le schéma §5
`);
