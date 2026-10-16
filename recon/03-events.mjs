// Phase 0, points 5 et 8 : dumper report.events (dataType: Casts) SANS filtre.
// Trois questions : structure d'un event, VOLUME réel, présence du champ `fight`.
// Le volume tranche la décision « filtrer ou tout stocker » (§5, §8.3).
// Le coût mesuré donne la capacité horaire réelle (§8.2).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gql, dump, logRate, requireTarget, DUMP_DIR } from './wcl.mjs';
import { fetchAllEvents } from './events.mjs';

const { reportCode, fight } = requireTarget();

// On réutilise le dump de 01-fights pour ne pas repayer la requête.
let report;
try {
  report = JSON.parse(await readFile(join(DUMP_DIR, '01-fights.json'), 'utf8'));
} catch {
  console.error('Lance d\'abord recon/01-fights.mjs — ce script réutilise son dump.');
  process.exit(1);
}
if (report.code !== reportCode) {
  console.error(`Le dump 01-fights porte sur ${report.code}, pas ${reportCode}.`);
  process.exit(1);
}

// Fenêtre : le fight demandé, sinon le plus long fight avec keystoneLevel (le fight de run).
const target =
  (typeof fight === 'number' && report.fights.find((f) => f.id === fight)) ||
  report.fights.filter((f) => f.keystoneLevel != null).sort((a, b) => b.endTime - b.startTime - (a.endTime - a.startTime))[0] ||
  report.fights.find((f) => f.encounterID !== 0);

if (!target) throw new Error('Aucun fight exploitable dans le dump 01-fights.');

const durationS = (target.endTime - target.startTime) / 1000;
console.log(`Fenêtre: fight ${target.id} "${target.name}" enc ${target.encounterID}, ${durationS.toFixed(0)}s`);
console.log(`(timestamps relatifs au rapport — §2.3)\n`);

const { events, pages, cost } = await fetchAllEvents({
  reportCode,
  startTime: target.startTime,
  endTime: target.endTime,
  filter: null,
  label: 'casts-sans-filtre',
});

await dump('03-events-nofilter', { fight: target, count: events.length, pages, cost, events });

console.log(`\n=== VOLUME ===`);
console.log(`${events.length} events en ${pages} page(s), coût ${cost.toFixed(2)} points`);
console.log(`JSON brut ≈ ${(JSON.stringify(events).length / 1024).toFixed(0)} Ko`);
console.log(`→ capacité horaire estimée: ${cost > 0 ? Math.floor(3600 / cost) : '∞'} scans de cette taille`);

console.log(`\n=== STRUCTURE ===`);
if (events[0]) {
  console.log('Champs du premier event :', Object.keys(events[0]).join(', '));
  console.log(JSON.stringify(events[0], null, 2));
} else {
  console.log('⚠️  ZÉRO event. Vérifier hostilityType, la fenêtre, ou les droits sur le rapport.');
}

const hasFight = events.some((e) => e.fight != null);
console.log(`\nChamp \`fight\` présent : ${hasFight ? 'OUI → bucketing direct, pas de fenêtres temporelles' : 'NON → il faudra bucketer par fenêtre (§2.2.2)'}`);

const byType = {};
for (const e of events) byType[e.type] = (byType[e.type] ?? 0) + 1;
console.log('\nRépartition par type (attendu: begincast + cast, §2.3) :');
for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t}: ${n}`);
}

const casts = events.filter((e) => e.type === 'cast');
const abilities = new Map();
for (const e of casts) abilities.set(e.abilityGameID, (abilities.get(e.abilityGameID) ?? 0) + 1);
console.log(`\n${abilities.size} abilityGameID distincts sur ${casts.length} events type='cast'.`);
console.log('Top 20 :');
for (const [id, n] of [...abilities].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(`  ${String(id).padStart(7)} × ${n}`);
}

const sources = new Set(casts.map((e) => e.sourceID));
console.log(`\nsourceID distincts: ${[...sources].sort((a, b) => a - b).join(', ')}`);
console.log('→ recouper avec les id de 02-playerdetails ; tout id inconnu est un pet/totem (piège #6).');

console.log(`
À TRANCHER dans NOTES.md :
  - volume + Ko par run → « filtrer ou tout stocker » (§5)
  - coût en points → capacité horaire réelle (§8.2)
  - présence du champ \`fight\`
  - abilityGameID vs ability.id : confirmer le nom dans le payload (§2.3)
`);
