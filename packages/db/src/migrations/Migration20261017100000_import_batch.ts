import { Migration } from '@mikro-orm/migrations';

/**
 * Import de masse : `import_batch` (un personnage, ses donjons, un niveau minimum : la
 * catégorie qui regroupe les runs importées ensemble) et `import_candidate` (les clés
 * trouvées sur Warcraft Logs pour ce lot).
 *
 * Pas de clé étrangère de `import_candidate` vers `scanned_run` : voir l'entité.
 *
 * DDL repris tel quel de `schema:update --dump`.
 */
export class Migration20261017100000_import_batch extends Migration {
  override async up(): Promise<void> {
    this.addSql('create table "import_batch" ("id" serial primary key, "name" varchar(128) null, "character_name" varchar(64) not null, "server_slug" varchar(64) not null, "server_region" varchar(4) not null, "healer_spec_id" int null, "season_id" int not null, "min_level" int not null, "dungeons" int[] not null, "created_at" timestamptz not null);');
    this.addSql('create table "import_candidate" ("id" serial primary key, "batch_id" int not null, "report_code" varchar(32) not null, "fight_id" int not null, "game_zone_id" int not null, "keystone_level" int not null, "medal" varchar(16) not null, "spec" varchar(32) null, "started_at" timestamptz not null, "duration" int not null, "last_error" text null, "last_error_at" timestamptz null);');
    this.addSql('create index "import_candidate_report_code_fight_id_index" on "import_candidate" ("report_code", "fight_id");');
    this.addSql('alter table "import_candidate" add constraint "import_candidate_batch_id_report_code_fight_id_unique" unique ("batch_id", "report_code", "fight_id");');
    this.addSql('alter table "import_batch" add constraint "import_batch_season_id_foreign" foreign key ("season_id") references "season" ("id") on update cascade;');
    this.addSql('alter table "import_candidate" add constraint "import_candidate_batch_id_foreign" foreign key ("batch_id") references "import_batch" ("id") on update cascade on delete cascade;');
    this.addSql('alter table "import_candidate" add constraint "import_candidate_game_zone_id_foreign" foreign key ("game_zone_id") references "dungeon" ("game_zone_id") on update cascade;');
  }

  override async down(): Promise<void> {
    this.addSql('drop table if exists "import_candidate" cascade;');
    this.addSql('drop table if exists "import_batch" cascade;');
  }
}
