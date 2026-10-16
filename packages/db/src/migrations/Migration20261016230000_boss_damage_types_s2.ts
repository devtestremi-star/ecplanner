import { Migration } from '@mikro-orm/migrations';

/**
 * Nature des capacités de boss de la saison 2, classées à la main une par une (121
 * sur 122) d'après leur tooltip et les dégâts mesurés sur les runs scannées.
 *
 * Trois natures s'ajoutent à `burst` et `dot` : `tankbuster` (n'appelle que les réponses
 * du tank et les externes), `dodge` et `ignore` (jamais une ancre). Umbral Rupture
 * (Taz'rah) n'est pas classée : elle reste `burst`.
 *
 * Miroir de `seed/data/boss-spells.json` (`damageType`). DDL repris de
 * `schema:update --dump`.
 */
const TYPES: Record<string, number[]> = {
  burst: [
  381516, 474197, 1218203, 1218347, 1236746, 1242860, 1257094, 1262497, 1288049, 1288864,
  1289059, 1303115, 1303327, 1307894, 1309525, 1311956, 1312146,
  ],
  dodge: [
  264172, 381525, 1234850, 1253268, 1296050,
  ],
  dot: [
  265773, 265781, 267618, 372864, 373686, 381517, 381862, 474478, 1214357, 1214637, 1222098,
  1226120, 1227264, 1234233, 1234753, 1234802, 1235118, 1235548, 1235564, 1235640, 1235656,
  1236709, 1239825, 1241058, 1243011, 1243569, 1246858, 1251345, 1282770, 1289109, 1291618,
  1293048, 1295453, 1296216, 1296220, 1299053, 1299154, 1300259, 1300876, 1301413, 1303267,
  1307297, 1307308,
  ],
  ignore: [
  265923, 267702, 269230, 269369, 372110, 373046, 474234, 474240, 474408, 474765, 1214650,
  1222484, 1222642, 1222721, 1222755, 1224478, 1228198, 1235623, 1235783, 1235828, 1237090,
  1239919, 1246372, 1246751, 1246753, 1253811, 1263971, 1263982, 1264095, 1264188, 1272290,
  1289205, 1290029, 1297017, 1299130, 1300686, 1301111, 1307703, 1310357, 1310547, 1311923,
  ],
  tankbuster: [
  265910, 268586, 372858, 381512, 473898, 1222795, 1237267, 1247746, 1288428, 1290797, 1298949,
  1299940, 1300044, 1301350, 1303488,
  ],
};

export class Migration20261016230000_boss_damage_types_s2 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table "spell" drop constraint if exists "spell_damage_type_check";`);
    this.addSql(`alter table "spell" add constraint "spell_damage_type_check" check("damage_type" in ('burst', 'dot', 'tankbuster', 'dodge', 'ignore'));`);
    for (const [type, ids] of Object.entries(TYPES)) {
      this.addSql(`update "spell" set "damage_type" = '${type}' where "spell_id" in (${ids.join(', ')});`);
    }
  }

  override async down(): Promise<void> {
    // Avant : tout en burst, sauf Triple Shot et Ssscavenging en dot.
    this.addSql(`update "spell" set "damage_type" = 'burst' where "damage_type" is not null and "spell_id" not in (1296220, 1296216);`);
    this.addSql(`update "spell" set "damage_type" = 'dot' where "spell_id" in (1296220, 1296216);`);
    this.addSql(`alter table "spell" drop constraint if exists "spell_damage_type_check";`);
    this.addSql(`alter table "spell" add constraint "spell_damage_type_check" check("damage_type" in ('burst', 'dot'));`);
  }
}
