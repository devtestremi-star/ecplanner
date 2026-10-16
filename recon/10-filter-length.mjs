// Jusqu'où peut-on allonger une `filterExpression` ?
//
// Cas d'usage visé : une table SpellReference en BD, dont on injecte tous les spellId
// dans le filtre au moment du scan. La liste peut atteindre plusieurs centaines d'ids
// (défensifs + offensifs + externes + boss + soins, toutes specs confondues).
//
// Chaque essai contient les 3 sorts DK dont on connaît le compte exact (76 casts).
// → si le résultat vaut 76, le filtre est correct à cette taille
// → si 0, échec muet par nom/longueur (cf. E5)
// → si 11743, filtre ignoré, on paie plein tarif sans le savoir

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gql, dump, DUMP_DIR } from './wcl.mjs';

const report = JSON.parse(await readFile(join(DUMP_DIR, '01-fights.json'), 'utf8'));
const f3 = report.fights.find((f) => f.id === 3);

const KNOWN = [42650, 1233448, 48707];
const EXPECTED = 76;
const CAST_TOTAL = 11743; // volume si le filtre est ignoré

const QUERY = `query ($c: String!, $s: Float!, $e: Float!, $f: String) {
  reportData { report(code: $c) {
    events(startTime: $s, endTime: $e, dataType: Casts, hostilityType: Friendlies, limit: 10000, filterExpression: $f) {
      data nextPageTimestamp
    }
  } }
}`;

// Ids de remplissage plausibles : 6 à 7 chiffres, comme les vrais spellId récents.
function buildExpr(n) {
  const filler = Array.from({ length: n - KNOWN.length }, (_, i) => 1000000 + i * 7);
  return `type = "cast" and ability.id in (${[...KNOWN, ...filler].join(', ')})`;
}

const SIZES = [3, 100, 300, 500, 1000, 2000, 3000, 5000, 8000];
const results = [];

for (const n of SIZES) {
  const expr = buildExpr(n);
  const bytes = Buffer.byteLength(expr, 'utf8');
  process.stdout.write(`${String(n).padStart(5)} ids | ${String(bytes).padStart(7)} octets → `);

  try {
    const res = await gql(QUERY, { c: report.code, s: f3.startTime, e: f3.endTime, f: expr });
    const ev = res.data.reportData.report.events;
    const got = ev.data.length;

    let verdict;
    if (got === EXPECTED) verdict = '✅ correct';
    else if (got === 0) verdict = '☠️ ÉCHEC MUET (0 event)';
    else if (got >= CAST_TOTAL || ev.nextPageTimestamp != null) verdict = '☠️ FILTRE IGNORÉ';
    else verdict = `⚠️ inattendu (${got} ≠ ${EXPECTED})`;

    console.log(`${String(got).padStart(6)} events | ${(res.cost ?? 0).toFixed(2)} pts | ${verdict}`);
    results.push({ n, bytes, got, cost: res.cost, verdict, ok: got === EXPECTED });
  } catch (err) {
    const msg = err.message.replace(/\s+/g, ' ').slice(0, 150);
    console.log(`ERREUR — ${msg}`);
    console.log(`        (une erreur explicite est un bon comportement : la borne est détectable)`);
    results.push({ n, bytes, error: msg, ok: false });
  }
}

await dump('10-filter-length', { expected: EXPECTED, castTotal: CAST_TOTAL, results });

const ok = results.filter((r) => r.ok);
const ko = results.filter((r) => !r.ok);
console.log(`\n${'='.repeat(64)}`);
if (ko.length === 0) {
  const max = ok[ok.length - 1];
  console.log(`Aucune borne atteinte jusqu'à ${max.n} ids (${max.bytes} octets).`);
} else {
  const last = ok[ok.length - 1];
  const first = ko[0];
  console.log(`Dernière taille correcte : ${last?.n ?? 0} ids (${last?.bytes ?? 0} octets)`);
  console.log(`Première taille en échec : ${first.n} ids (${first.bytes} octets) — ${first.verdict ?? first.error}`);
  console.log(`\n⚠️  Le mode d'échec est ${first.error ? 'une ERREUR EXPLICITE (détectable)' : 'SILENCIEUX (indétectable sans compte de référence)'}`);
}
