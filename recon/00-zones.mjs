// Phase 0, points 1 & 2 : valider le client credentials flow, puis construire
// la table encounterID → nom de la zone M+ courante.
// Sans cette table, impossible de distinguer le fight de run des fights de boss (§4.3).

import { gql, dump, logRate, primeRateLimit } from './wcl.mjs';

const rate0 = await primeRateLimit();
console.log(`OAuth OK — budget ${rate0.limitPerHour} pts/h, déjà dépensé ${rate0.pointsSpentThisHour}`);

// Liste des zones pour repérer celle de la saison M+ courante.
const listQuery = `{
  worldData {
    expansions { id name }
    zones {
      id
      name
      frozen
      expansion { id name }
      encounters { id name }
    }
  }
}`;

const { data, rate, cost } = await gql(listQuery);
logRate('worldData.zones', rate, cost);
await dump('00-zones', data.worldData);

const zones = data.worldData.zones ?? [];
const lastExpansion = Math.max(...zones.map((z) => z.expansion?.id ?? 0));

console.log(`\n${zones.length} zones. Dernière extension: id ${lastExpansion}`);
console.log('\nZones de la dernière extension (chercher ici la zone Mythic+) :');
for (const z of zones) {
  if (z.expansion?.id !== lastExpansion) continue;
  console.log(`  zone ${z.id} — ${z.name} — ${z.encounters?.length ?? 0} encounters — frozen=${z.frozen}`);
}

// Si on connaît déjà la zone, on sort la table encounterID → nom.
const zoneId = process.env.WCL_ZONE_ID ? Number(process.env.WCL_ZONE_ID) : null;
if (zoneId) {
  const zone = zones.find((z) => z.id === zoneId);
  if (!zone) {
    console.error(`\n⚠️  zone ${zoneId} absente de worldData.zones`);
  } else {
    console.log(`\nTable encounterID → nom pour la zone ${zone.id} (${zone.name}) :`);
    for (const e of zone.encounters ?? []) console.log(`  ${e.id} → ${e.name}`);
    await dump('00-zone-encounters', zone);
  }
} else {
  console.log('\nℹ️  Définis WCL_ZONE_ID dans recon/.env pour figer la table encounterID → nom.');
}

console.log(`
À NOTER dans NOTES.md :
  - id de la zone M+ de la saison courante
  - la liste encounterID → nom (les boss)
  - l'encounterID du DONJON lui-même, s'il apparaît (piège §4.3)
`);
