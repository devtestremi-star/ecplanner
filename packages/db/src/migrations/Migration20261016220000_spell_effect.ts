import { Migration } from '@mikro-orm/migrations';

/**
 * Ce que fait chaque sort de joueur qui peut répondre à une capacité de boss
 * (`Spell.effect`) : HEALING, SHIELD ou DR. Classement fait à la main, sort par sort,
 * d'après les tooltips Wowhead (88 sorts).
 *
 * Six sorts sortent des réponses, sans bénéfice défensif : Sindragosa's Fury passe en
 * OFFENSIVE ; Greater Invisibility, Invisibility, Mirror Image, Holy Word: Chastise et
 * Spirit of Redemption passent en UTILITY.
 *
 * Miroir de `seed/data/spells.json` et `spells-manual.json` (`effect`, `category`). DDL
 * repris de `schema:update --dump`.
 */
const DR = [
      498, 586, 642, 1160, 5277, 6940, 22812, 31224, 31821, 31850, 33206, 45438, 47585, 47788,
      48792, 49028, 51052, 53480, 61336, 62618, 102342, 104773, 108271, 118038, 132578, 186265,
      196718, 198103, 198589, 243435, 264735, 357170, 363916, 374227, 403876,
];
const HEALING = [
      633, 740, 15286, 19236, 31884, 33891, 49039, 55233, 64843, 97462, 98008, 108280, 109304,
      114052, 114165, 115310, 118779, 132158, 184364, 185311, 200183, 205223, 216331, 322118,
      342245, 355913, 359816, 363534, 370537, 375576, 378081, 383013, 388615, 391528, 421453,
      421543, 443028, 443454, 472433, 1263824,
];
const SHIELD = [
      1022, 11426, 48707, 48743, 108416, 116849, 122470, 235219, 235313, 235450, 325197, 1258283,
      1291894,
];

const OFFENSIVE = [190778];
const UTILITY = [110959, 66, 55342, 88625, 215769];
/** Catégories d'avant, pour le retour arrière. */
const PREVIOUS: ReadonlyArray<[number, string]> = [
  [190778, 'PERSONAL'], [110959, 'PERSONAL'], [66, 'PERSONAL'], [55342, 'PERSONAL'],
  [88625, 'HEALER'], [215769, 'HEALER'],
];

export class Migration20261016220000_spell_effect extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "spell" add column "effect" text check ("effect" in ('HEALING', 'SHIELD', 'DR')) null;`);
    for (const [effect, ids] of [['HEALING', HEALING], ['SHIELD', SHIELD], ['DR', DR]] as const) {
      this.addSql(`update "spell" set "effect" = '${effect}' where "spell_id" in (${ids.join(', ')});`);
    }
    this.addSql(`update "spell" set "category" = 'OFFENSIVE' where "spell_id" in (${OFFENSIVE.join(', ')});`);
    this.addSql(`update "spell" set "category" = 'UTILITY' where "spell_id" in (${UTILITY.join(', ')});`);
  }

  override async down(): Promise<void> {
    for (const [id, category] of PREVIOUS) {
      this.addSql(`update "spell" set "category" = '${category}' where "spell_id" = ${id};`);
    }
    this.addSql(`alter table "spell" drop column "effect";`);
  }
}
