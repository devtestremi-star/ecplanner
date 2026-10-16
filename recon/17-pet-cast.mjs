// Piège #5 (§7.1) : un sort suivi peut être émis par une entité intermédiaire
// (totem, familier, garde) et non par le joueur. Le filtrer sur le roster le fait
// disparaître sans erreur.
//
// Usage : node --env-file=recon/.env recon/17-pet-cast.mjs <url|code> <fightID> <spellId…>

import { gql, dump, logRate, parseReportUrl } from './wcl.mjs';

const target = process.argv[2];
const fightArg = process.argv[3];
const SPELLS = process.argv.slice(4).map(Number);
if (!target || !SPELLS.length) {
  console.error('Usage: node --env-file=recon/.env recon/17-pet-cast.mjs <url|code> <fightID> <spellId…>');
  process.exit(1);
}
const { reportCode, fight: fightFromUrl } = parseReportUrl(target);
const fightID = Number(fightArg ?? fightFromUrl);

// 1. Fenêtre du fight + roster + acteurs, en une requête
const Q1 = `query ($c: String!, $f: [Int]) {
  reportData { report(code: $c) {
    zone { id name }
    fights(fightIDs: $f) {
      id name encounterID startTime endTime keystoneLevel gameZone { id name }
      dungeonPulls { id name encounterID startTime endTime }
    }
    playerDetails(fightIDs: $f)
    masterData { actors { id gameID name type subType petOwner } }
  } }
}`;

const a = await gql(Q1, { c: reportCode, f: [fightID] });
logRate('fights + roster', a.rate, a.cost);
const rep = a.data.reportData.report;
const f = rep.fights[0];
if (!f) throw new Error(`fight ${fightID} introuvable dans ${reportCode}`);

console.log(`\n${reportCode} fight ${f.id} — "${f.name}" enc ${f.encounterID}` +
  (f.keystoneLevel ? ` +${f.keystoneLevel}` : '') +
  ` — ${((f.endTime - f.startTime) / 1000).toFixed(0)}s — zone ${rep.zone?.id} ${rep.zone?.name}`);

const pd = a.data.reportData.report.playerDetails.data.playerDetails;
const roster = new Map();
for (const [role, arr] of Object.entries(pd)) {
  for (const p of arr) roster.set(p.id, { ...p, role });
}
console.log(`\nRoster (${roster.size}) :`);
for (const [id, p] of [...roster].sort((x, y) => x[0] - y[0])) {
  console.log(`  sourceID ${String(id).padStart(2)} — ${p.name}-${p.server} — ${p.type} ${JSON.stringify(p.specs?.map?.((s) => s.spec ?? s))}`);
}

const actors = new Map(rep.masterData.actors.map((x) => [x.id, x]));
const pets = rep.masterData.actors.filter((x) => x.petOwner != null);
console.log(`\n${pets.length} acteurs avec petOwner.`);

// 2. Les sorts visés, sans filtre de type ni de hostilité
const Q2 = `query ($c: String!, $s: Float!, $e: Float!, $f: String) {
  reportData { report(code: $c) {
    events(startTime: $s, endTime: $e, dataType: All, limit: 10000, filterExpression: $f) {
      data nextPageTimestamp
    }
  } }
}`;

const expr = `ability.id in (${SPELLS.join(', ')})`;
const b = await gql(Q2, { c: reportCode, s: f.startTime, e: f.endTime, f: expr });
logRate('events', b.rate, b.cost);
const events = b.data.reportData.report.events.data;

console.log(`\nFiltre : ${expr}`);
console.log(`→ ${events.length} events${b.data.reportData.report.events.nextPageTimestamp ? ' (paginé !)' : ''}`);

if (!events.length) {
  console.log('\n⚠️  Aucun event. Le sort n\'est pas lancé sur cette fenêtre, ou l\'id est faux.');
  process.exit(0);
}

// 3. Verdict : qui émet ?
const bySrc = {};
for (const e of events) {
  const k = e.sourceID;
  (bySrc[k] ??= { types: {}, abilities: new Set() });
  bySrc[k].types[e.type] = (bySrc[k].types[e.type] ?? 0) + 1;
  bySrc[k].abilities.add(e.abilityGameID);
}

console.log('\n=== QUI ÉMET ? ===');
let orphanCasts = 0;
for (const [src, v] of Object.entries(bySrc).sort((x, y) => x[0] - y[0])) {
  const id = Number(src);
  const known = roster.has(id);
  const actor = actors.get(id);
  const owner = actor?.petOwner != null ? roster.get(actor.petOwner) : null;
  const casts = v.types.cast ?? 0;
  if (!known && casts) orphanCasts += casts;

  console.log(
    `${known ? '  ✅' : '  ⚠️ '} sourceID ${String(src).padStart(3)} — ` +
      `${actor ? `"${actor.name}" [${actor.type}${actor.subType ? '/' + actor.subType : ''}]` : 'inconnu'}` +
      `${known ? ' — DANS le roster' : ' — ABSENT du roster'}` +
      `${actor?.petOwner != null ? ` — petOwner ${actor.petOwner}${owner ? ` (${owner.name}, ${owner.type})` : ''}` : ''}`
  );
  console.log(`       types ${JSON.stringify(v.types)} | abilities ${JSON.stringify([...v.abilities])}`);
}

console.log('\n=== VERDICT ===');
if (orphanCasts > 0) {
  console.log(`☠️  ${orphanCasts} cast(s) émis par une entité ABSENTE du roster.`);
  console.log('    Un filtre naïf sur les sourceID de playerDetails les perdrait en silence.');
  console.log('    → réattribution obligatoire via masterData.actors[].petOwner.');
} else {
  const inRoster = Object.entries(bySrc).filter(([s, v]) => roster.has(Number(s)) && v.types.cast);
  console.log(`✅ Les ${inRoster.reduce((n, [, v]) => n + v.types.cast, 0)} cast(s) viennent tous du roster.`);
  console.log('   Sur CE sort et CE log, le piège #5 ne se manifeste pas.');
}

await dump('17-pet-cast', {
  reportCode, fightID, spells: SPELLS, expr,
  roster: [...roster.entries()],
  pets: pets.map((p) => ({ id: p.id, name: p.name, petOwner: p.petOwner })),
  bySrc: Object.fromEntries(Object.entries(bySrc).map(([k, v]) => [k, { types: v.types, abilities: [...v.abilities] }])),
  events,
});
