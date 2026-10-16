import { Migration } from '@mikro-orm/migrations';

/**
 * Nature des dégâts des sorts de boss (`Spell.damageType`) : `burst` ou `dot`. Elle décide
 * comment l'alignement rattache les réponses des joueurs.
 *
 * Tous les sorts de boss partent en `burst`, le comportement d'avant. Seuls deux sorts de
 * Rav'i sont qualifiés `dot`, d'après les debuffs relevés sur RFZzaJpCtXAhM6Gx :
 * Triple Shot (debuff de 10 s) et Ssscavenging (debuff Carrion Burst, ~7 s).
 *
 * Regurgitate (Rav'i) ne fait aucun dégât — attaque évitable : il cesse de servir d'ancre
 * (`in_timeline` à false), comme l'addon qui l'a retiré de son plan.
 *
 * Miroir de `seed/data/boss-spells.json` (`damageType`, `inTimeline`). DDL repris de
 * `schema:update --dump`.
 */
export class Migration20261016210000_boss_damage_type extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "spell" add column "damage_type" text check ("damage_type" in ('burst', 'dot')) null;`);
    this.addSql(`update "spell" set "damage_type" = 'burst' where "boss_encounter_id" is not null;`);
    this.addSql(`update "spell" set "damage_type" = 'dot' where "spell_id" in (1296220, 1296216);`);
    this.addSql(`update "spell" set "in_timeline" = false where "spell_id" = 1296050;`);
  }

  override async down(): Promise<void> {
    this.addSql(`update "spell" set "in_timeline" = true where "spell_id" = 1296050;`);
    this.addSql(`alter table "spell" drop column "damage_type";`);
  }
}
