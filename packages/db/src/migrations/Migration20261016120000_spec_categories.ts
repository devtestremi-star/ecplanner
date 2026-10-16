import { Migration } from '@mikro-orm/migrations';

/**
 * Requalification par spec des sorts `HEALER` partagés avec des specs non soigneuses.
 *
 * Avenging Wrath (31884) est le MÊME sort en Holy, Protection et Retribution : sans
 * requalification, les casts d'un paladin Ret s'affichaient sous « Soins ». Même défaut
 * pour Convoke, Nature's/Ancestral Swiftness, Celestial Conduit et Zephyr.
 *
 * Retire aussi des liens spec erronés — sorts propres au soigneur rattachés à toute la
 * classe par le seed initial. Sans effet d'affichage (un dps ne les lance pas), mais ils
 * gonflaient le filtre de scan.
 *
 * Miroir exact des entrées ajoutées à `seed/data/spec-overrides.json`, qui reste la source
 * de vérité : un seed relancé réappliquerait de lui-même ces valeurs.
 *
 * Données seulement, sans DDL. Les UPDATE/DELETE ne touchent que des lignes existantes :
 * sur une base pas encore seedée, la migration ne fait rien et ne viole aucune FK.
 */
const OVERRIDES: ReadonlyArray<[spellId: number, specId: number, category: string]> = [
  [31884, 66, 'OFFENSIVE'],   // Avenging Wrath — Protection
  [31884, 70, 'OFFENSIVE'],   // Avenging Wrath — Retribution
  [391528, 102, 'OFFENSIVE'], // Convoke the Spirits — Balance
  [391528, 103, 'OFFENSIVE'], // Convoke the Spirits — Feral
  [391528, 104, 'OFFENSIVE'], // Convoke the Spirits — Guardian
  [378081, 262, 'UTILITY'],   // Nature's Swiftness — Elemental
  [378081, 263, 'UTILITY'],   // Nature's Swiftness — Enhancement
  [443454, 262, 'UTILITY'],   // Ancestral Swiftness — Elemental
  [443454, 263, 'UTILITY'],   // Ancestral Swiftness — Enhancement
  [443028, 269, 'OFFENSIVE'], // Celestial Conduit — Windwalker
  [374227, 1467, 'EXTERNAL'], // Zephyr — Devastation
  [374227, 1473, 'EXTERNAL'], // Zephyr — Augmentation
];

const REMOVES: ReadonlyArray<[spellId: number, specId: number]> = [
  [216331, 66], [216331, 70],     // Avenging Crusader — Holy seul
  [215769, 258],                  // Spirit of Redemption — Holy seul
  [421453, 258],                  // Ultimate Penitence — Discipline seule
  [322118, 268], [322118, 269],   // Invoke Yu'lon — Mistweaver seul
  [325197, 268], [325197, 269],   // Invoke Chi-Ji — Mistweaver seul
  [388615, 268], [388615, 269],   // Restoral — Mistweaver seul
  [359816, 1467], [359816, 1473], // Dream Flight — Preservation seule
  [363534, 1467], [363534, 1473], // Rewind — Preservation seule
  [370537, 1467], [370537, 1473], // Stasis — Preservation seule
  [740, 102],                     // Tranquility — Restoration seule
  [443028, 268],                  // Celestial Conduit — pas en Brewmaster
];

const pairs = (rows: ReadonlyArray<readonly [number, number, ...unknown[]]>): string =>
  rows.map(([spell, spec]) => `(${spell}, ${spec})`).join(', ');

export class Migration20261016120000_spec_categories extends Migration {
  override async up(): Promise<void> {
    for (const [spell, spec, category] of OVERRIDES) {
      this.addSql(
        `update spell_spec set category = '${category}' where spell_id = ${spell} and spec_id = ${spec};`,
      );
    }
    this.addSql(`delete from spell_spec where (spell_id, spec_id) in (${pairs(REMOVES)});`);
  }

  override async down(): Promise<void> {
    this.addSql(`update spell_spec set category = null where (spell_id, spec_id) in (${pairs(OVERRIDES)});`);
    // Ne recrée un lien que si le sort existe encore — sinon la FK refuserait.
    this.addSql(
      `insert into spell_spec (spell_id, spec_id)
       select v.spell_id, v.spec_id from (values ${pairs(REMOVES)}) as v(spell_id, spec_id)
       where exists (select 1 from spell s where s.spell_id = v.spell_id)
       on conflict do nothing;`,
    );
  }
}
