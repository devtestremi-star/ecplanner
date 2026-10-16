import { Migration } from '@mikro-orm/migrations';

/**
 * Temple of Sethraliss, relevé sur k82XDyvQ7TGan93L :
 *  - trois capacités que le log enregistre sous un autre id que celui de l'addon (même
 *    nom) : Gale Force et Thunder and Lightning (Adderis and Aspix), Induction (Galvazzt) ;
 *  - Gale Force et Thunder and Lightning deviennent des ancres (`in_timeline`) : l'addon les
 *    planifie depuis sa révision du 2026-10-13 (`allowedInPlan = true`).
 *
 * Miroir de `seed/data/boss-spells.json` (`aliases`, `inTimeline`).
 */
const ALIASES: ReadonlyArray<[alias: number, spell: number]> = [
  [1289062, 1289059], // Gale Force
  [1288087, 1288049], // Thunder and Lightning
  [1290531, 1309525], // Induction
];
const NOW_ANCHORS = [1289059, 1288049];

export class Migration20261016250000_sethraliss_aliases extends Migration {
  override async up(): Promise<void> {
    const values = ALIASES.map(([alias, spell]) => `(${alias}, ${spell})`).join(', ');
    this.addSql(`insert into "spell_alias" ("alias_id", "spell_id")
      select v.alias_id, v.spell_id from (values ${values}) as v(alias_id, spell_id)
      where exists (select 1 from "spell" s where s."spell_id" = v.spell_id)
      on conflict ("alias_id") do update set "spell_id" = excluded."spell_id";`);
    this.addSql(`update "spell" set "in_timeline" = true where "spell_id" in (${NOW_ANCHORS.join(', ')});`);
  }

  override async down(): Promise<void> {
    this.addSql(`update "spell" set "in_timeline" = false where "spell_id" in (${NOW_ANCHORS.join(', ')});`);
    this.addSql(`delete from "spell_alias" where "alias_id" in (${ALIASES.map(([a]) => a).join(', ')});`);
  }
}
