// Phase 0, point 3 : dumper report.fights sur un log M+ témoin.
// Objectif : distinguer le fight de RUN (encounterID = donjon) des fights de BOSS,
// et constater ce que l'URL désigne réellement (§4.3, piège #1).

import { gql, dump, logRate, requireTarget } from './wcl.mjs';

const { reportCode, fight, source } = requireTarget();
console.log(`Rapport ${reportCode} — fight demandé dans l'URL: ${fight ?? '(aucun)'}${source ? `, source=${source}` : ''}`);

const query = `query ($code: String!) {
  reportData {
    report(code: $code) {
      code
      title
      startTime
      endTime
      zone { id name }
      fights {
        id
        name
        encounterID
        startTime
        endTime
        kill
        difficulty
        size
        keystoneLevel
        keystoneTime
        keystoneBonus
        keystoneAffixes
        friendlyPlayers
        gameZone { id name }
        dungeonPulls { id name encounterID startTime endTime }
      }
    }
  }
}`;

const { data, rate, cost } = await gql(query, { code: reportCode });
logRate('report.fights', rate, cost);

const report = data.reportData.report;
if (!report) throw new Error(`Rapport ${reportCode} introuvable ou privé (endpoint client)`);

await dump('01-fights', report);

console.log(`\nreport.startTime = ${report.startTime} (epoch ms ABSOLU — ne jamais mélanger, §2.3)`);
console.log(`report.zone = ${report.zone?.id} ${report.zone?.name}`);
console.log(`\n${report.fights.length} fights :`);

for (const f of report.fights) {
  const dur = ((f.endTime - f.startTime) / 1000).toFixed(1);
  const key = f.keystoneLevel ? ` +${f.keystoneLevel}` : '';
  const pulls = f.dungeonPulls?.length ? ` [${f.dungeonPulls.length} dungeonPulls]` : '';
  console.log(
    `  fight ${String(f.id).padStart(3)} | enc ${String(f.encounterID).padStart(5)}${key} | ` +
      `${String(f.startTime).padStart(8)}→${String(f.endTime).padStart(8)} (${dur}s) | ` +
      `kill=${f.kill} | ${f.name}${pulls}`
  );
}

const withEncounter = report.fights.filter((f) => f.encounterID !== 0);
const runCandidates = withEncounter.filter((f) => f.keystoneLevel != null || f.dungeonPulls?.length);

console.log(`\n${withEncounter.length} fights avec encounterID ≠ 0 (le trash porte 0).`);
console.log(`${runCandidates.length} portent keystoneLevel ou dungeonPulls → candidats "fight de run" :`);
for (const f of runCandidates) {
  console.log(`  fight ${f.id} — enc ${f.encounterID} — ${f.name} — keystone +${f.keystoneLevel}`);
}

console.log(`
À VÉRIFIER dans NOTES.md :
  - le fight de run porte-t-il l'encounterID du DONJON (≠ des boss) ?
  - le fight pointé par l'URL est-il ce fight de run ? (piège #1)
  - dungeonPulls suffit-il à énumérer les boss, ou faut-il croiser worldData ?
  - des encounterID présents ici mais absents de 00-zone-encounters ? (§4.3, à loguer)
`);
