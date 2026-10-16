import { Migration } from '@mikro-orm/migrations';

/**
 * Inferno Spit (Kyrakka and Erkhart Stormvein, Ruby Life Pools) : l'id de l'addon, 381862,
 * n'est dans le log que le DEBUFF posé sur les joueurs. Le cast porte deux ids selon la
 * phase — 381602 au sol (~21-23 s), 381605 une fois le rythme accéléré (~17 s), comme le
 * note l'addon. Relevé sur k82XDyvQ7TGan93L fight 16 : 4 + 6 casts.
 *
 * Miroir de `seed/data/boss-spells.json` (`aliases`).
 */
const ALIASES: ReadonlyArray<[alias: number, spell: number]> = [
  [381602, 381862],
  [381605, 381862],
];

export class Migration20261016310000_kyrakka_inferno_spit extends Migration {
  override async up(): Promise<void> {
    const values = ALIASES.map(([alias, spell]) => `(${alias}, ${spell})`).join(', ');
    this.addSql(`insert into "spell_alias" ("alias_id", "spell_id")
      select v.alias_id, v.spell_id from (values ${values}) as v(alias_id, spell_id)
      where exists (select 1 from "spell" s where s."spell_id" = v.spell_id)
      on conflict ("alias_id") do update set "spell_id" = excluded."spell_id";`);
  }

  override async down(): Promise<void> {
    this.addSql(`delete from "spell_alias" where "alias_id" in (${ALIASES.map(([a]) => a).join(', ')});`);
  }
}
