import { Migration } from '@mikro-orm/migrations';

/**
 * Burrow (Merektha) passe de `dodge` à `dot` : l'attaque s'évite, mais elle ouvre la
 * phase sous terre, où Burrowquake (1300227) frappe tout le groupe chaque seconde jusqu'au
 * retour du boss (44 à 56 s, ~48 M de dégâts sur k82XDyvQ7TGan93L). Les soins de cette
 * phase y répondent : Burrow doit servir d'ancre.
 *
 * Miroir de `seed/data/boss-spells.json` (`damageType`).
 */
export class Migration20261016290000_merektha_burrow_dot extends Migration {
  override async up(): Promise<void> {
    this.addSql(`update "spell" set "damage_type" = 'dot' where "spell_id" = 264172;`);
  }

  override async down(): Promise<void> {
    this.addSql(`update "spell" set "damage_type" = 'dodge' where "spell_id" = 264172;`);
  }
}
