// Quantification exacte du budget d'une `filterExpression` de la forme
// `ability.id in (…)`, pour implémenter un garde-fou côté application.
//
// Hypothèse à valider : le coût d'un id vaut ses chiffres + une constante K,
// et la somme doit rester sous un budget B.
//        Σ (chiffres(id) + K)  ≤  B
//
// On mesure le seuil exact pour plusieurs longueurs d'id, on ajuste (K, B) par
// moindres carrés, puis on VALIDE la prédiction sur une liste mixte réaliste.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gql, dump, DUMP_DIR } from './wcl.mjs';

const report = JSON.parse(await readFile(join(DUMP_DIR, '01-fights.json'), 'utf8'));
const f3 = report.fights.find((f) => f.id === 3);

const QUERY = `query ($c: String!, $s: Float!, $e: Float!, $f: String) {
  reportData { report(code: $c) {
    events(startTime: $s, endTime: $e, dataType: All, limit: 10000, filterExpression: $f) {
      data nextPageTimestamp
    }
  } }
}`;

let calls = 0;

/** true = l'API répond ; false = events:null (HTTP 200, sans erreur GraphQL) */
async function accepts(ids) {
  calls++;
  const expr = `ability.id in (${ids.join(', ')})`;
  const res = await gql(QUERY, { c: report.code, s: f3.startTime, e: f3.endTime, f: expr });
  return res.data?.reportData?.report?.events != null;
}

/** Plus grand n tel que la liste de n ids soit acceptée. */
async function threshold(makeIds, lo = 1, hi = 4000) {
  if (await accepts(makeIds(hi))) return { n: hi, capped: true };
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    (await accepts(makeIds(mid))) ? (lo = mid) : (hi = mid);
  }
  return { n: lo, capped: false };
}

// --- 1. Seuil exact par longueur d'id -------------------------------------
const DIGITS = [3, 4, 5, 6, 7];
const points = [];

console.log('Seuil exact par longueur d\'id (dichotomie ouverte) :\n');
console.log('  chiffres |   n max | Σ octets de la liste');
console.log('  ---------|---------|---------------------');

for (const d of DIGITS) {
  const base = Math.pow(10, d - 1);
  const { n } = await threshold((k) => Array.from({ length: k }, (_, i) => base + i));
  const bytes = n * d + (n - 1) * 2; // ids + séparateurs ", "
  points.push({ digits: d, n, bytes });
  console.log(`  ${String(d).padStart(8)} | ${String(n).padStart(7)} | ${String(bytes).padStart(19)}`);
}

// --- 2. Ajustement de (K, B) ----------------------------------------------
// n·(d + K) = B  ⇔  n·d = B − K·n  → régression linéaire de y=n·d sur x=n
const N = points.length;
const sx = points.reduce((s, p) => s + p.n, 0);
const sy = points.reduce((s, p) => s + p.n * p.digits, 0);
const sxx = points.reduce((s, p) => s + p.n * p.n, 0);
const sxy = points.reduce((s, p) => s + p.n * (p.n * p.digits), 0);
const slope = (N * sxy - sx * sy) / (N * sxx - sx * sx); // = −K
const intercept = (sy - slope * sx) / N; // = B
const K = -slope;
const B = intercept;

console.log(`\nAjustement :  Σ (chiffres + K) ≤ B   avec  K = ${K.toFixed(3)},  B = ${B.toFixed(0)}`);
console.log('\n  chiffres | n mesuré | n prédit | écart');
console.log('  ---------|----------|----------|------');
for (const p of points) {
  const pred = Math.floor(B / (p.digits + K));
  p.predicted = pred;
  p.errPct = +(((pred - p.n) / p.n) * 100).toFixed(2);
  console.log(
    `  ${String(p.digits).padStart(8)} | ${String(p.n).padStart(8)} | ${String(pred).padStart(8)} | ${(p.errPct >= 0 ? '+' : '') + p.errPct}%`
  );
}

// --- 3. Validation sur une liste MIXTE réaliste ---------------------------
// Vrais spellId observés dans le log, longueurs mélangées (5 à 7 chiffres).
const base = JSON.parse(await readFile(join(DUMP_DIR, '03-events-nofilter.json'), 'utf8'));
const realIds = [...new Set(base.events.map((e) => e.abilityGameID))].filter((x) => x > 0);
const cost = (ids) => ids.reduce((s, id) => s + String(id).length + K, 0);

// On répète la liste réelle jusqu'à dépasser, en gardant des ids distincts plausibles.
const pool = [];
let bump = 0;
while (pool.length < 2000) {
  for (const id of realIds) pool.push(id + bump * 1000000);
  bump++;
}
const mixed = (k) => pool.slice(0, k);

const digitsHist = {};
for (const id of mixed(500)) digitsHist[String(id).length] = (digitsHist[String(id).length] ?? 0) + 1;
console.log(`\nListe mixte de validation — répartition des longueurs sur 500 ids : ${JSON.stringify(digitsHist)}`);

const { n: mixedN } = await threshold(mixed);
const mixedCost = cost(mixed(mixedN));
const mixedCostNext = cost(mixed(mixedN + 1));
console.log(`  seuil mesuré : ${mixedN} ids  →  coût calculé ${mixedCost.toFixed(0)} (budget ajusté ${B.toFixed(0)})`);
console.log(`  premier refus: ${mixedN + 1} ids  →  coût calculé ${mixedCostNext.toFixed(0)}`);
const ok = mixedCost <= B && mixedCostNext > B;
console.log(`  ${ok ? '✅ le modèle prédit correctement le seuil sur liste mixte' : '⚠️  le modèle ne borne pas exactement — appliquer une marge'}`);

// --- 4. Budget recommandé --------------------------------------------------
const SAFE = Math.floor(Math.min(B, mixedCost) * 0.9);
console.log(`\n${'='.repeat(70)}`);
console.log(`BUDGET MESURÉ      : ${B.toFixed(0)}`);
console.log(`BUDGET RECOMMANDÉ  : ${SAFE}  (marge de 10 %)`);
console.log(`Coût d'un id       : nb de chiffres + ${K.toFixed(2)}`);
console.log(`\nCapacité au budget recommandé, par longueur d'id :`);
for (const d of [5, 6, 7]) console.log(`  ids à ${d} chiffres → ${Math.floor(SAFE / (d + K))} ids`);
console.log(`\nGarde-fou à implémenter :`);
console.log(`  const cost = ids.reduce((s, id) => s + String(id).length + ${K.toFixed(2)}, 0);`);
console.log(`  if (cost > ${SAFE}) { /* fallback : restreindre aux classes présentes */ }`);
console.log(`\n(${calls} requêtes consommées pour cette mesure)`);

await dump('13-filter-budget', { points, K, B, SAFE, mixedN, mixedCost, mixedCostNext, calls });
