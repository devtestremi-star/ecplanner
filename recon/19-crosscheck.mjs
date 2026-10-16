// Génère la feuille de validation croisée (§6, Phase 0) :
// des comptes issus de l'API, à confronter à la main sur le site WCL.
//
// C'est le seul contrôle qui attrape un sourceID mal résolu — lequel produit
// zéro résultat sans erreur.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gql, logRate, DUMP_DIR } from './wcl.mjs';

const CODE = 'TaqLH6KvWAG3XVP8';
const FID = 3;

const report = JSON.parse(await readFile(join(DUMP_DIR, '01-fights.json'), 'utf8'));
const f = report.fights.find((x) => x.id === FID);
const base = JSON.parse(await readFile(join(DUMP_DIR, '03-events-nofilter.json'), 'utf8'));
const pdRaw = JSON.parse(await readFile(join(DUMP_DIR, '02-playerdetails.json'), 'utf8'));

const roster = new Map();
for (const arr of Object.values(pdRaw.data.playerDetails)) {
  for (const p of arr) roster.set(p.id, p);
}

const casts = base.events.filter((e) => e.type === 'cast');
const bosses = f.dungeonPulls.filter((p) => p.encounterID !== 0);

// Un sort par joueur : celui dont l'écart minimum est le plus long (le cooldown le plus
// marquant), avec un nombre de casts assez petit pour être compté à la main.
const picks = [];
for (const [srcId, p] of [...roster].sort((a, b) => a[0] - b[0])) {
  const byAb = {};
  for (const e of casts) {
    if (e.sourceID !== srcId) continue;
    (byAb[e.abilityGameID] ??= []).push(e.timestamp);
  }
  const scored = Object.entries(byAb)
    .map(([ab, ts]) => {
      ts.sort((a, b) => a - b);
      let min = Infinity;
      for (let i = 1; i < ts.length; i++) min = Math.min(min, (ts[i] - ts[i - 1]) / 1000);
      return { ability: +ab, n: ts.length, minGap: min, ts };
    })
    // Un vrai cooldown : écart min >= 30 s, et relancé assez souvent pour que ce soit
    // un choix de jeu et non un usage incident. Comptable à la main jusqu'à ~25.
    .filter((x) => x.n >= 5 && x.n <= 25 && x.minGap >= 30)
    .sort((a, b) => b.n - a.n);
  // Deux sorts par joueur : le plus utilisé, et le plus long cooldown.
  const byLongest = [...scored].sort((a, b) => b.minGap - a.minGap)[0];
  for (const c of [scored[0], byLongest !== scored[0] ? byLongest : null]) {
    if (c) picks.push({ srcId, player: p, ...c });
  }
}

// Noms via gameData
const q = '{' + picks.map((x, i) => `a${i}: gameData { ability(id: ${x.ability}) { id name } }`).join(' ') + '}';
const r = await gql(q);
logRate('noms de sorts', r.rate, r.cost);
picks.forEach((x, i) => (x.name = r.data[`a${i}`]?.ability?.name ?? '?'));

const url = (src, ab) =>
  `https://www.warcraftlogs.com/reports/${CODE}#fight=${FID}&type=casts&source=${src}&ability=${ab}`;

let md = `# Feuille de validation croisée — Phase 0

> Dernier point bloquant du §6. Compter **à la main sur le site WCL** et confronter aux
> comptes de l'API ci-dessous. Un \`sourceID\` mal résolu produit zéro résultat sans erreur :
> c'est le seul contrôle qui l'attrape.

**Rapport** : \`${CODE}\` — fight ${FID}, ${f.name} +${f.keystoneLevel}, ${((f.endTime - f.startTime) / 1000).toFixed(0)} s

Sur le site : onglet **Casts**, sélectionner le joueur dans *Source*, puis le sort.
Les liens ci-dessous pré-sélectionnent les deux.

## Comptes sur la run entière

| Joueur | Spec | Sort | id | Écart min | Casts (API) | Casts (site) | ✓ |
|---|---|---|---|---|---|---|---|
`;
for (const x of picks) {
  md += `| ${x.player.name} | ${x.player.specs?.[0]?.spec ?? '?'} ${x.player.type} | [${x.name}](${url(x.srcId, x.ability)}) | \`${x.ability}\` | ${x.minGap.toFixed(0)}s | **${x.n}** | | |\n`;
}

md += `
## Comptes par fenêtre de boss

C'est le découpage \`dungeonPulls\` qui est testé ici, pas seulement la résolution du
\`sourceID\`. **Trois ou quatre lignes suffisent** — inutile de tout dépouiller. Prends de
préférence des lignes sur des boss différents.

Sur le site, restreindre à une fenêtre de boss : dans l'onglet Casts, la barre de temps sous
le graphe permet de sélectionner un intervalle. Les offsets ci-dessous sont **relatifs au
début de la run**.

| Boss | Fenêtre (offset run) | Joueur | Sort | Casts (API) | Casts (site) | ✓ |
|---|---|---|---|---|---|---|
`;
for (const [i, b] of bosses.entries()) {
  const s = ((b.startTime - f.startTime) / 1000).toFixed(0);
  const e = ((b.endTime - f.startTime) / 1000).toFixed(0);
  for (const x of picks) {
    const n = x.ts.filter((t) => t >= b.startTime && t <= b.endTime).length;
    if (!n) continue;
    md += `| #${i} ${b.name} | +${s}s → +${e}s | ${x.player.name} | ${x.name} | **${n}** | | |\n`;
  }
}

md += `
## Totaux de contrôle

| Mesure | API |
|---|---|
| Events tous types sur la run | ${base.events.length} |
| dont \`type = 'cast'\` | ${casts.length} |
| \`abilityGameID\` distincts | ${new Set(casts.map((e) => e.abilityGameID)).size} |
| \`sourceID\` distincts | ${[...new Set(casts.map((e) => e.sourceID))].sort((a, b) => a - b).join(', ')} |
| Boss détectés | ${bosses.length} — ${bosses.map((b) => b.name).join(', ')} |

## Critère de sortie

Toutes les lignes ✓. **Un seul écart invalide le pipeline** : soit la résolution du
\`sourceID\`, soit le découpage en fenêtres de boss, soit le filtre.
`;

const out = join(DUMP_DIR, '..', 'CROSSCHECK.md');
await writeFile(out, md);
console.log(md);
console.log(`\n→ écrit dans recon/CROSSCHECK.md`);
