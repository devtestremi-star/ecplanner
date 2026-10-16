import { Migration } from '@mikro-orm/migrations';

/**
 * Temple of Sethraliss, capacités planifiables (`allowed_in_plan`) revues à la main :
 * Tempest Winds et Overload (Adderis and Aspix) ne le sont plus, Lightning Spire
 * (Galvazzt) le devient.
 *
 * Miroir de `seed/data/boss-spells.json` (`allowedInPlan`).
 */
const NOT_PLANNABLE = [1288864, 1288428]; // Tempest Winds, Overload
const PLANNABLE = [1291618]; // Lightning Spire

export class Migration20261016270000_sethraliss_plannable extends Migration {
  override async up(): Promise<void> {
    this.addSql(`update "spell" set "allowed_in_plan" = false where "spell_id" in (${NOT_PLANNABLE.join(', ')});`);
    this.addSql(`update "spell" set "allowed_in_plan" = true where "spell_id" in (${PLANNABLE.join(', ')});`);
  }

  override async down(): Promise<void> {
    this.addSql(`update "spell" set "allowed_in_plan" = true where "spell_id" in (${NOT_PLANNABLE.join(', ')});`);
    this.addSql(`update "spell" set "allowed_in_plan" = false where "spell_id" in (${PLANNABLE.join(', ')});`);
  }
}
