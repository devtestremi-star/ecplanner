import { Migration } from '@mikro-orm/migrations';

/**
 * Burn Corruption (Mchimba the Embalmer, Kings' Rest), 1311956 côté addon, castée sous
 * 267639 dans le log (même nom, relevé sur WTVjnKDHgrXbyZ46 fight 4 : 7 casts toutes les
 * 30 à 35 s).
 *
 * Miroir de `seed/data/boss-spells.json` (`aliases`).
 */
export class Migration20261016340000_mchimba_burn_corruption extends Migration {
  override async up(): Promise<void> {
    this.addSql(`insert into "spell_alias" ("alias_id", "spell_id")
      select 267639, 1311956 where exists (select 1 from "spell" where "spell_id" = 1311956)
      on conflict ("alias_id") do update set "spell_id" = excluded."spell_id";`);
  }

  override async down(): Promise<void> {
    this.addSql(`delete from "spell_alias" where "alias_id" = 267639;`);
  }
}
