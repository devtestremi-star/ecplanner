import { Migration } from '@mikro-orm/migrations';

/**
 * Ancestral Swiftness (443454) en Elemental et Enhancement : OFFENSIVE, et non UTILITY
 * comme posé par `Migration20261016120000_spec_categories`. Pour un dps c'est un
 * cooldown de dégâts ; Restoration le garde en HEALER (catégorie par défaut du sort).
 *
 * Miroir de `seed/data/spec-overrides.json`.
 */
const SPECS = '262, 263'; // Elemental, Enhancement

export class Migration20261016160000_ancestral_swiftness_offensive extends Migration {
  override async up(): Promise<void> {
    this.addSql(`update spell_spec set category = 'OFFENSIVE' where spell_id = 443454 and spec_id in (${SPECS});`);
  }

  override async down(): Promise<void> {
    this.addSql(`update spell_spec set category = 'UTILITY' where spell_id = 443454 and spec_id in (${SPECS});`);
  }
}
