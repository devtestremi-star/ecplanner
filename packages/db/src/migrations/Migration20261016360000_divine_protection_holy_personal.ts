import { Migration } from '@mikro-orm/migrations';

/**
 * Divine Protection en Holy (498) redevient PERSONAL : on retire l'override HEALER posé par
 * `Migration20261016170000_divine_protection_holy`. La catégorie du sort (PERSONAL)
 * s'applique de nouveau.
 *
 * Miroir de `seed/data/spec-overrides.json` (override retiré).
 */
export class Migration20261016360000_divine_protection_holy_personal extends Migration {
  override async up(): Promise<void> {
    this.addSql(`update spell_spec set category = null where spell_id = 498 and spec_id = 65;`);
  }

  override async down(): Promise<void> {
    this.addSql(`update spell_spec set category = 'HEALER' where spell_id = 498 and spec_id = 65;`);
  }
}
