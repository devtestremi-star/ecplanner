import { Migration } from '@mikro-orm/migrations';

/**
 * Rav'i (Altar of Fangs) : deux capacités que le log ne connaît pas sous l'id de l'addon.
 *
 * - Ssscavenging, 1296216 côté addon. Ce n'est pas un cast : Rav'i se pose un buff,
 *   `applybuff` de 1298221 et 1298223 au même instant (~55 s d'écart). Alias vers 1298223
 *   seulement : 1298221 porte aussi l'absorption du bouclier, ~1 500 events `absorbed` par
 *   combat qu'il serait inutile de télécharger à chaque scan.
 * - Regurgitate, 1296050 côté addon, castée sous 1296058 dans le log.
 *
 * Miroir de `seed/data/boss-spells.json` (`aliases` + `filterType`).
 */
export class Migration20261016200000_ravi_aliases extends Migration {
  override async up(): Promise<void> {
    this.addSql(`update "spell" set "filter_type" = 'applybuff' where "spell_id" = 1296216;`);
    this.addSql(`insert into "spell_alias" ("alias_id", "spell_id")
      select v.alias_id, v.spell_id from (values (1298223, 1296216), (1296058, 1296050)) as v(alias_id, spell_id)
      where exists (select 1 from "spell" s where s."spell_id" = v.spell_id)
      on conflict ("alias_id") do update set "spell_id" = excluded."spell_id";`);
  }

  override async down(): Promise<void> {
    this.addSql(`delete from "spell_alias" where "alias_id" in (1298223, 1296058);`);
    this.addSql(`update "spell" set "filter_type" = null where "spell_id" = 1296216;`);
  }
}
