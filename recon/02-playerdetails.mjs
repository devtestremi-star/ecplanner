// Phase 0, point 4 : structure exacte de report.playerDetails (blob JSON non typé).
// Hypothèse à confirmer (§2.2.1) : { tanks: [], healers: [], dps: [] },
// chaque entrée portant id (= sourceID), guid, name, server, type, specs.

import { gql, dump, logRate, requireTarget } from './wcl.mjs';

const { reportCode, fight } = requireTarget();

const query = `query ($code: String!, $fightIDs: [Int]) {
  reportData {
    report(code: $code) {
      playerDetails(fightIDs: $fightIDs)
      masterData {
        actors { id gameID name type subType petOwner server }
      }
    }
  }
}`;

const fightIDs = typeof fight === 'number' ? [fight] : undefined;
const { data, rate, cost } = await gql(query, { code: reportCode, fightIDs });
logRate('playerDetails + masterData', rate, cost);

const report = data.reportData.report;
await dump('02-playerdetails', report.playerDetails);
await dump('02-masterdata-actors', report.masterData);

// playerDetails est un scalaire JSON : on inspecte, on ne suppose pas.
const pd = report.playerDetails;
console.log('\nClés de premier niveau de playerDetails :', Object.keys(pd));

const roles = pd.data?.playerDetails ?? pd.playerDetails ?? pd;
console.log('Clés de rôle trouvées :', Object.keys(roles));

for (const [role, players] of Object.entries(roles)) {
  if (!Array.isArray(players)) {
    console.log(`  ${role}: PAS un tableau (${typeof players}) ← hypothèse §2.2.1 fausse`);
    continue;
  }
  console.log(`\n  ${role} (${players.length}) :`);
  for (const p of players) {
    console.log(
      `    id=${p.id} guid=${p.guid} ${p.name}-${p.server} | type=${p.type} | specs=${JSON.stringify(p.specs?.map?.((s) => s.spec ?? s) ?? p.specs)}`
    );
  }
  if (players[0]) console.log(`    → champs disponibles: ${Object.keys(players[0]).join(', ')}`);
}

// Les entités intermédiaires (pets, totems, gardes) sont le pire mode d'échec (§7 piège #6).
const actors = report.masterData?.actors ?? [];
const pets = actors.filter((a) => a.petOwner != null);
console.log(`\n${actors.length} actors, dont ${pets.length} avec petOwner :`);
for (const p of pets.slice(0, 30)) {
  console.log(`  actor ${p.id} "${p.name}" (${p.subType}) → petOwner ${p.petOwner}`);
}
if (pets.length > 30) console.log(`  … ${pets.length - 30} de plus`);

console.log(`
À VÉRIFIER dans NOTES.md :
  - la structure réelle (imbrication data.playerDetails ou non)
  - id est-il bien le sourceID des events ? (à recouper avec 03-events)
  - guid est-il stable entre deux rapports du même joueur ? (clé de Character)
  - quels sorts importants sont lancés par un pet/totem plutôt que par le joueur ? (piège #6)
`);
