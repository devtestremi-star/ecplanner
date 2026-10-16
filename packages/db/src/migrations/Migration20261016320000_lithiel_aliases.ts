import { Migration } from '@mikro-orm/migrations';

/**
 * Lithiel Cinderfury (Murder Row) : deux capacités que le log enregistre sous un autre id
 * que celui de l'addon (même nom, relevé sur 4TQ79gBvx2dcJp8n fight 2). Fingers of Gul'dan
 * est la seule capacité planifiable du boss.
 *
 * Fingers of Gul'dan : alias vers le CAST 474462 (4 par combat), pas vers 474457 qui
 * compte chaque projectile de la vague (16 par combat).
 *
 * Miroir de `seed/data/boss-spells.json` (`aliases`).
 */
const ALIASES: ReadonlyArray<[alias: number, spell: number]> = [
  [474462, 1218203], // Fingers of Gul'dan
  [1217345, 1224478], // Malefic Wave
];

export class Migration20261016320000_lithiel_aliases extends Migration {
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
