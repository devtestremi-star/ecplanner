import { Migration } from '@mikro-orm/migrations';

/**
 * Serpentine Gust (The Golden Serpent, Kings' Rest), 265781 côté addon, castée sous
 * 1311987 dans le log (même nom, relevé sur WTVjnKDHgrXbyZ46 fight 4 : 7 casts, deux par
 * cycle de 65 s). 1311988, homonyme, n'est que l'id des dégâts.
 *
 * Miroir de `seed/data/boss-spells.json` (`aliases`).
 */
export class Migration20261016330000_golden_serpent_gust extends Migration {
  override async up(): Promise<void> {
    this.addSql(`insert into "spell_alias" ("alias_id", "spell_id")
      select 1311987, 265781 where exists (select 1 from "spell" where "spell_id" = 265781)
      on conflict ("alias_id") do update set "spell_id" = excluded."spell_id";`);
  }

  override async down(): Promise<void> {
    this.addSql(`delete from "spell_alias" where "alias_id" = 1311987;`);
  }
}
