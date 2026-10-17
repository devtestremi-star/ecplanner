import { EntityManager } from '@mikro-orm/postgresql';
import { Controller, Get, NotFoundException, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { dedupBossEvents } from '../boss-dedup.js';
import type { CompactEvent, RunParticipant } from '@timeline/db';
import { SPELL_SET_VERSION } from '@timeline/scanner';
import { AdminGuard } from './admin.guard.js';

interface PullRow {
  reportCode: string; fightID: number; orderIndex: number; startTime: number; duration: number;
  events: CompactEvent[]; keystoneLevel: number; kill: boolean; startedAt: Date; participants: RunParticipant[];
  spellSetVersion: number;
}

/**
 * Outils d'admin, hors CRUD. Même garde que le reste de l'admin.
 *
 * Extraction de timers : on rend les casts BRUTS de chaque combat (instants relatifs au
 * pull), et c'est le front qui fait les moyennes. Cocher ou décocher une run recalcule
 * alors sans aller-retour.
 */
@Controller('admin/tools')
@UseGuards(AdminGuard)
export class ToolsController {
  constructor(private readonly em: EntityManager) {}

  /** Les boss pour lesquels on a au moins un combat scanné, groupés par donjon. */
  @Get('timers')
  async timerBosses(): Promise<unknown> {
    return this.em.getConnection().execute(`
      select b.encounter_id as "encounterID", b.name, d.name as dungeon, count(*)::int as pulls,
             count(distinct (sb.report_code, sb.fight_id))::int as runs
      from scanned_boss sb
      join boss b on b.encounter_id = sb.encounter_id
      join dungeon d on d.game_zone_id = b.dungeon_id
      group by b.encounter_id, b.name, d.name
      order by d.name, min(sb.order_index), b.name`);
  }

  /**
   * Tous les combats scannés d'un boss, avec les casts de ses capacités CURÉES.
   *
   * Les events sont déjà ramenés à l'id de l'addon au scan (alias). On applique la même
   * fusion des doublons (< 5 s) que l'affichage et l'export : sinon trois Ethereal Shades
   * compteraient pour trois occurrences.
   */
  @Get('timers/:encounterID')
  async timers(@Param('encounterID', ParseIntPipe) encounterID: number): Promise<unknown> {
    const conn = this.em.getConnection();
    const [boss] = await conn.execute(
      `select b.encounter_id as "encounterID", b.name, d.name as dungeon
       from boss b join dungeon d on d.game_zone_id = b.dungeon_id where b.encounter_id = ?`,
      [encounterID],
    );
    if (!boss) throw new NotFoundException(`Unknown boss ${encounterID}`);

    const spells = await conn.execute<Array<{ spellId: number }>>(
      `select spell_id as "spellId", name, icon, damage_type as "damageType", allowed_in_plan as "allowedInPlan"
       from spell where boss_encounter_id = ? order by name`,
      [encounterID],
    );
    const curated = new Set(spells.map((s) => s.spellId));

    const rows = await conn.execute<PullRow[]>(
      `select sb.report_code as "reportCode", sb.fight_id as "fightID", sb.order_index as "orderIndex",
              sb.start_time as "startTime", sb.duration, sb.events,
              r.keystone_level as "keystoneLevel", r.kill, r.started_at as "startedAt", r.participants,
              r.spell_set_version as "spellSetVersion"
       from scanned_boss sb
       join scanned_run r on r.report_code = sb.report_code and r.fight_id = sb.fight_id
       where sb.encounter_id = ?
       order by r.started_at desc`,
      [encounterID],
    );

    const pulls = rows.map((r) => {
      const players = new Set(r.participants.map((p) => p.sourceID));
      const casts = dedupBossEvents(r.events, players)
        .filter(([, src, ability]) => !players.has(src) && curated.has(ability))
        .map(([ts, , ability]) => [ts - r.startTime, ability] as const);
      return {
        reportCode: r.reportCode,
        fightID: r.fightID,
        orderIndex: r.orderIndex,
        keystoneLevel: r.keystoneLevel,
        kill: r.kill,
        startedAt: r.startedAt,
        duration: r.duration,
        /**
         * Scanné avec un jeu de sorts plus ancien : il manque les capacités ajoutées depuis
         * (alias notamment). Le front décoche ces combats par défaut.
         */
        outdated: r.spellSetVersion < SPELL_SET_VERSION,
        casts,
      };
    });

    return { boss, spells, pulls };
  }
}
