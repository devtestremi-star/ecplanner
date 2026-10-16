import { Migration } from '@mikro-orm/migrations';

/**
 * Divine Protection en Holy (498) : HEALER, et non PERSONAL. Pour un paladin soigneur
 * c'est un cooldown de soin.
 *
 * Celle de Retribution est un AUTRE sort (403876), homonyme : elle reste PERSONAL et
 * n'est pas touchée ici.
 *
 * Miroir de `seed/data/spec-overrides.json`.
 */
export class Migration20261016170000_divine_protection_holy extends Migration {
  override async up(): Promise<void> {
    this.addSql(`update spell_spec set category = 'HEALER' where spell_id = 498 and spec_id = 65;`);
  }

  override async down(): Promise<void> {
    this.addSql(`update spell_spec set category = null where spell_id = 498 and spec_id = 65;`);
  }
}
