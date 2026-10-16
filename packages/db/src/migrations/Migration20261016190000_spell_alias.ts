import { Migration } from '@mikro-orm/migrations';

/**
 * Table `spell_alias` : identifiants sous lesquels le log de combat enregistre un sort de
 * boss, quand ils diffèrent de celui de la curation (l'identifiant de l'addon).
 *
 * Premiers alias : Ravenous Bellow (The Hoardmonger), 1235118 côté addon. Le log la caste
 * sous 1234681, puis sous le nom de Hearty Bellow (1235125) dans le même créneau du cycle.
 * Miroir de `seed/data/boss-spells.json` (champ `aliases`).
 *
 * DDL repris tel quel de `schema:update --dump`.
 */
export class Migration20261016190000_spell_alias extends Migration {
  override async up(): Promise<void> {
    this.addSql('create table "spell_alias" ("alias_id" int not null, "spell_id" int not null, constraint "spell_alias_pkey" primary key ("alias_id"));');
    this.addSql('create index "spell_alias_spell_id_index" on "spell_alias" ("spell_id");');
    this.addSql('alter table "spell_alias" add constraint "spell_alias_spell_id_foreign" foreign key ("spell_id") references "spell" ("spell_id") on update cascade on delete cascade;');
    // Ne crée l'alias que si le sort curé existe : sur une base pas encore seedée, rien à faire.
    this.addSql(`insert into "spell_alias" ("alias_id", "spell_id")
      select v.alias_id, v.spell_id from (values (1234681, 1235118), (1235125, 1235118)) as v(alias_id, spell_id)
      where exists (select 1 from "spell" s where s."spell_id" = v.spell_id);`);
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "spell_alias" cascade;');
  }
}
