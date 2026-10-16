import { Migration } from '@mikro-orm/migrations';

/**
 * Kokia Blazehoof (Ruby Life Pools) : deux capacités que le log enregistre sous un autre id
 * que celui de l'addon (même nom, relevé sur k82XDyvQ7TGan93L fight 16). Ritual of
 * Blazebinding est la seule capacité planifiable du boss : sans alias, rien ne s'y rattachait.
 *
 * Miroir de `seed/data/boss-spells.json` (`aliases`).
 */
const ALIASES: ReadonlyArray<[alias: number, spell: number]> = [
  [372863, 372864], // Ritual of Blazebinding
  [372107, 372110], // Molten Boulder
];

export class Migration20261016300000_kokia_aliases extends Migration {
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
