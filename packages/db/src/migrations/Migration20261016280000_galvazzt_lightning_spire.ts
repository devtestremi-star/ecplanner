import { Migration } from '@mikro-orm/migrations';

/**
 * Lightning Spire (Galvazzt), 1291618 côté addon, n'est jamais castée : les spires
 * (des pets du combat) posent un debuff sur les joueurs, Galvanized (266923), toutes les
 * ~23 s — le rythme que l'addon note pour la capacité. On capte donc l'application de ce
 * debuff : alias 266923 et `filter_type` `applydebuff`.
 *
 * Miroir de `seed/data/boss-spells.json` (`aliases`, `filterType`).
 */
export class Migration20261016280000_galvazzt_lightning_spire extends Migration {
  override async up(): Promise<void> {
    this.addSql(`update "spell" set "filter_type" = 'applydebuff' where "spell_id" = 1291618;`);
    this.addSql(`insert into "spell_alias" ("alias_id", "spell_id")
      select 266923, 1291618 where exists (select 1 from "spell" where "spell_id" = 1291618)
      on conflict ("alias_id") do update set "spell_id" = excluded."spell_id";`);
  }

  override async down(): Promise<void> {
    this.addSql(`delete from "spell_alias" where "alias_id" = 266923;`);
    this.addSql(`update "spell" set "filter_type" = null where "spell_id" = 1291618;`);
  }
}
