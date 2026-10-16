import { Migration } from '@mikro-orm/migrations';

/**
 * Voidscar Arena : cinq capacités que le log enregistre sous un autre id que celui de
 * l'addon (même nom, relevé sur HRj2wBgVzJ9nhXf4). Charonus n'affichait que Dark Waves.
 *
 * Miroir de `seed/data/boss-spells.json` (`aliases`).
 */
const ALIASES: ReadonlyArray<[alias: number, spell: number, name: string]> = [
  [1222100, 1222098, 'Nether Dash (Taz\'rah)'],
  [1227197, 1227264, 'Cosmic Crash (Charonus)'],
  [1227247, 1222755, 'Void Cascade (Charonus)'],
  [1310025, 1263982, 'Gravitic Orbs (Charonus)'],
  [1248112, 1282770, 'Unstable Singularity (Charonus)'],
];

export class Migration20261016240000_voidscar_aliases extends Migration {
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
