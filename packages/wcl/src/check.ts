/**
 * Vérification de bout en bout du client, contre les chiffres établis en Phase 0.
 * Toute divergence ici signale une régression du parsing, pas un problème d'API.
 */
import { WclClient } from './client.js';
import { InvalidRunUrlError, parseRunUrl, tryParseRunUrl } from './url.js';
import { buildAbilityFilter, filterCost, FILTER_BUDGET } from './filter.js';
import { fetchAllEvents } from './events.js';
import { REPORT_FIGHTS, REPORT_ROSTER } from './queries.js';
import { AbilitySchema, ActorSchema, flattenRoster, ReportSchema } from './schemas.js';
import { z } from 'zod';

const URL_TEMOIN = 'https://www.warcraftlogs.com/reports/TaqLH6KvWAG3XVP8?fight=3';
const DK_SPELLS = [42650, 1233448, 48707]; // Army of the Dead, Dark Transformation, AMS
const EXPECTED_DK_CASTS = 76; // compté en Phase 0, dump 08-three-spells.json

let failures = 0;
const check = (label: string, ok: boolean, detail = ''): void => {
  if (!ok) failures++;
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
};

// --- 1. Étage 1 de la validation : parsing, aucun appel réseau ------------
console.log('\n1. Parsing d\'URL (étage 1, 0 point)');
const bare = tryParseRunUrl('https://www.warcraftlogs.com/reports/TaqLH6KvWAG3XVP8');
check(
  'URL nue refusée',
  bare instanceof InvalidRunUrlError && bare.reason === 'no-fight',
  bare instanceof InvalidRunUrlError ? bare.reason : 'acceptée à tort',
);
check('fragment #fight=7 lu', parseRunUrl('https://www.warcraftlogs.com/reports/TaqLH6KvWAG3XVP8#fight=7&source=3').fight === 7);
check("fight=last accepté", parseRunUrl('https://www.warcraftlogs.com/reports/TaqLH6KvWAG3XVP8?fight=last').fight === 'last');
const parsed = parseRunUrl(URL_TEMOIN);
check('témoin parsé', parsed.reportCode === 'TaqLH6KvWAG3XVP8' && parsed.fight === 3);

// --- 2. Garde-fou du budget de filtre ------------------------------------
console.log('\n2. Garde-fou du filtre (NOTES E11)');
const at7digits = Array.from({ length: 640 }, (_, i) => 1_000_000 + i);
check('640 ids à 7 chiffres > budget de sécurité', !(filterCost(at7digits) <= FILTER_BUDGET),
  `coût ${filterCost(at7digits).toFixed(0)} vs budget ${FILTER_BUDGET}`);
check('3 ids passent', filterCost(DK_SPELLS) < FILTER_BUDGET);

// --- 3. Le scan réel ------------------------------------------------------
const clientId = process.env.WCL_CLIENT_ID;
const clientSecret = process.env.WCL_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.log('\n⚠️  WCL_CLIENT_ID / SECRET absents — étapes réseau ignorées.');
  process.exit(failures === 0 ? 0 : 1);
}

const client = new WclClient({ credentials: { clientId, clientSecret } });

console.log('\n3. Requête 1/3 — fights');
const r1 = await client.query<{ reportData: { report: unknown } }>(REPORT_FIGHTS, {
  code: parsed.reportCode,
});
const report = ReportSchema.parse(r1.data.reportData.report);
check('rapport parsé par Zod', true, `${report.fights.length} fights, coût ${r1.cost ?? '?'}`);

const fight = report.fights.find((f) => f.id === parsed.fight);
check('fight 3 trouvé', !!fight);
check('étage 2 : keystoneLevel présent', fight?.keystoneLevel === 24, `+${fight?.keystoneLevel}`);
check('gameZone stable exposée', fight?.gameZone?.id === 2526, `gameZone ${fight?.gameZone?.id}`);

const bosses = (fight?.dungeonPulls ?? []).filter((p) => p.encounterID !== 0);
check('4 boss dans dungeonPulls', bosses.length === 4, bosses.map((b) => b.name).join(', '));
check('orderIndex ≠ pullId', bosses[0]?.id === 2, `premier boss = pull ${bosses[0]?.id}, orderIndex 0`);

// L'ancrage absolu : sans lui les timestamps relatifs sont orphelins.
const startedAt = new Date(report.startTime + (fight?.startTime ?? 0));
check('startedAt calculable', !Number.isNaN(startedAt.getTime()), startedAt.toISOString());

console.log('\n4. Requête 2/3 — roster');
const r2 = await client.query<{ reportData: { report: { playerDetails: unknown; masterData: unknown } } }>(
  REPORT_ROSTER,
  { code: parsed.reportCode, fightIDs: [parsed.fight] },
);
const roster = flattenRoster(r2.data.reportData.report.playerDetails);
check('5 joueurs', roster.length === 5, roster.map((p) => `${p.name}(${p.specs[0]?.spec})`).join(', '));
check('specs est un tableau d\'objets', typeof roster[0]?.specs[0] === 'object');

const md = z
  .object({ actors: z.array(ActorSchema), abilities: z.array(AbilitySchema) })
  .parse(r2.data.reportData.report.masterData);
check('abilities avec nom et icône', md.abilities.every((a) => a.icon !== null),
  `${md.abilities.length} abilities`);
const pets = md.actors.filter((a) => a.petOwner != null);
check('acteurs pets identifiés', pets.length > 0, `${pets.length} avec petOwner`);

console.log('\n5. Requête 3/3 — events');
const filter = buildAbilityFilter(DK_SPELLS);
const { events, pages, totalCost } = await fetchAllEvents(client, {
  reportCode: parsed.reportCode,
  startTime: fight!.startTime,
  endTime: fight!.endTime,
  filter,
  onPage: ({ page, count, cost }) => console.log(`     page ${page}: ${count} events, coût ${cost ?? '?'}`),
});
const casts = events.filter((e) => e.type === 'cast');
check(`${EXPECTED_DK_CASTS} casts attendus`, casts.length === EXPECTED_DK_CASTS, `obtenu ${casts.length}`);
check('1 seule page', pages === 1, `${pages} page(s), coût total ${totalCost.toFixed(2)}`);

const sources = [...new Set(casts.map((e) => e.sourceID))];
const known = new Set(roster.map((p) => p.id));
check('aucun cast hors roster', sources.every((s) => s !== undefined && known.has(s)),
  `sourceIDs ${JSON.stringify(sources)}`);

// Répartition par fenêtre de boss — teste le découpage dungeonPulls.
console.log('\n6. Découpage par boss');
for (const [i, b] of bosses.entries()) {
  const n = casts.filter((e) => e.timestamp >= b.startTime && e.timestamp <= b.endTime).length;
  console.log(`     #${i} ${b.name.padEnd(20)} +${((b.startTime - fight!.startTime) / 1000).toFixed(0)}s → ${n} casts`);
}

console.log(`\n${failures === 0 ? '✅ Toutes les vérifications passent' : `❌ ${failures} échec(s)`}`);
process.exit(failures === 0 ? 0 : 1);
