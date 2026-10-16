import { Migration } from '@mikro-orm/migrations';

/**
 * Burn Corruption (Mchimba the Embalmer) ne frappe qu'un joueur par cast, le tank : on la
 * classe `tankbuster` et on la retire de l'export ECP (`allowed_in_plan` false). Elle reste
 * visible sur la timeline.
 *
 * Miroir de `seed/data/boss-spells.json` (`damageType`, `allowedInPlan`).
 */
export class Migration20261016350000_mchimba_burn_corruption_tank extends Migration {
  override async up(): Promise<void> {
    this.addSql(`update "spell" set "damage_type" = 'tankbuster', "allowed_in_plan" = false where "spell_id" = 1311956;`);
  }

  override async down(): Promise<void> {
    this.addSql(`update "spell" set "damage_type" = 'burst', "allowed_in_plan" = true where "spell_id" = 1311956;`);
  }
}
