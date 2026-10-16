import { Migration } from '@mikro-orm/migrations';

/**
 * `in_timeline` devient `allowed_in_plan`, le nom du drapeau de l'addon qu'il copie : sort
 * de boss planifiable, ancre d'alignement et cible d'export ECP. L'ancien nom laissait
 * croire à un réglage d'affichage (celui de l'addon s'appelle `allowInTimeline`). Données
 * inchangées. DDL repris de `schema:update --dump`.
 */
export class Migration20261016260000_rename_allowed_in_plan extends Migration {
  override async up(): Promise<void> {
    this.addSql('alter table "spell" rename column "in_timeline" to "allowed_in_plan";');
  }

  override async down(): Promise<void> {
    this.addSql('alter table "spell" rename column "allowed_in_plan" to "in_timeline";');
  }
}
