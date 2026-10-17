import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { WOW_SPECS, wowClass, wowClassByName } from '@timeline/shared';
import { ScanService } from '../scan.service.js';

/** `Name-Server-Region`. Le royaume peut contenir des tirets (Azjol-Nerub) : nom en tête, région en queue. */
const REGIONS = new Set(['EU', 'US', 'KR', 'TW', 'CN']);

export interface ParsedCharacter {
  name: string;
  serverSlug: string;
  region: string;
}

/**
 * Slug de royaume au format WCL/Blizzard : minuscules, sans accent ni apostrophe ni
 * parenthèse, espaces en tirets. « Aggra (Português) » → `aggra-portugues`.
 */
export const serverSlug = (server: string): string =>
  server
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['()]/g, '')
    .trim()
    .replace(/\s+/g, '-');

export function parseCharacter(raw: string): ParsedCharacter {
  const parts = raw.trim().split('-').map((p) => p.trim()).filter(Boolean);
  const region = parts.at(-1)?.toUpperCase() ?? '';
  if (parts.length < 3 || !REGIONS.has(region)) {
    throw new BadRequestException('Expected Name-Server-Region, e.g. Eiiko-Sylvanas-EU');
  }
  return { name: parts[0]!, serverSlug: serverSlug(parts.slice(1, -1).join('-')), region };
}

/** Deux uploads d'une même run (deux joueurs du groupe qui loggent) : même donjon, départs à moins de 10 s. */
const SAME_RUN_MS = 10_000;

interface Rank {
  report: { code: string; fightID: number };
  bracketData: number;
  medal: string;
  spec: string | null;
  startTime: number;
  duration: number;
}

interface FoundRun {
  reportCode: string;
  fightID: number;
  gameZoneId: number;
  keystoneLevel: number;
  medal: string;
  spec: string | null;
  startedAt: Date;
  duration: number;
}

export interface CreateBatchInput {
  character: string;
  dungeons: number[];
  minLevel: number;
  name?: string | null;
  healerSpecId?: number | null;
}

/** Specs de soin : la seule chose qu'un lot peut déclarer comme `healerSpecId`. */
const HEALER_SPECS = WOW_SPECS.filter((s) => s.role === 'healer');

@Injectable()
export class ImportsService {
  constructor(
    private readonly em: EntityManager,
    private readonly scans: ScanService,
  ) {}

  private get conn() {
    return this.em.getConnection();
  }

  async list(): Promise<unknown> {
    return this.conn.execute(`
      select b.id, b.name, b.character_name as "characterName", b.server_slug as "serverSlug",
             b.server_region as "serverRegion", b.healer_spec_id as "healerSpecId", b.min_level as "minLevel",
             b.dungeons, b.created_at as "createdAt", s.name as season,
             count(c.id)::int as total, count(r.report_code)::int as imported
      from import_batch b
      join season s on s.id = b.season_id
      left join import_candidate c on c.batch_id = b.id
      left join scanned_run r on r.report_code = c.report_code and r.fight_id = c.fight_id
      group by b.id, s.name
      order by b.created_at desc`);
  }

  async get(id: number): Promise<unknown> {
    const [batch] = await this.conn.execute(`
      select b.id, b.name, b.character_name as "characterName", b.server_slug as "serverSlug",
             b.server_region as "serverRegion", b.healer_spec_id as "healerSpecId", b.min_level as "minLevel",
             b.dungeons, b.created_at as "createdAt", s.name as season
      from import_batch b join season s on s.id = b.season_id where b.id = ?`, [id]);
    if (!batch) throw new NotFoundException(`Unknown batch ${id}`);
    // Statut « importée » CALCULÉ : voir `ImportCandidate`.
    const candidates = await this.conn.execute(`
      select c.id, c.report_code as "reportCode", c.fight_id as "fightID", c.game_zone_id as "gameZoneId",
             d.name as dungeon, c.keystone_level as "keystoneLevel", c.medal, c.spec,
             c.started_at as "startedAt", c.duration, c.last_error as "lastError",
             (r.report_code is not null) as imported
      from import_candidate c
      join dungeon d on d.game_zone_id = c.game_zone_id
      left join scanned_run r on r.report_code = c.report_code and r.fight_id = c.fight_id
      where c.batch_id = ?
      order by c.keystone_level desc, c.started_at desc`, [id]);
    return { batch, candidates };
  }

  /** Tout ce que le formulaire propose : donjons de la saison active et specs de soin. */
  async options(): Promise<unknown> {
    return {
      dungeons: await this.dungeons(),
      healerSpecs: HEALER_SPECS.map((s) => ({
        id: s.id,
        name: s.name,
        className: wowClass(s.classId)?.name ?? '',
        color: wowClass(s.classId)?.color ?? null,
        icon: s.icon,
      })),
    };
  }

  /** Donjons de la saison active : les puces du formulaire. */
  async dungeons(): Promise<unknown> {
    return this.conn.execute(`
      select d.game_zone_id as "gameZoneId", d.name, ds.encounter_id as "encounterID"
      from dungeon_season ds
      join season s on s.id = ds.season_id and s.active
      join dungeon d on d.game_zone_id = ds.dungeon_game_zone_id
      order by d.name`);
  }

  /**
   * Crée le lot ET liste ses clés, sans rien scanner.
   *
   * Une seule requête WCL : le classement du personnage, un alias par donjon. Il rend
   * chaque run classée avec son rapport, son fight, son niveau (`bracketData`) et sa
   * médaille (`none` = clé ratée). ~9 points pour 8 donjons. Les logs privés n'y sont pas.
   */
  async create(input: CreateBatchInput): Promise<{ id: number; found: number }> {
    const who = parseCharacter(input.character);
    const minLevel = Math.max(2, Math.floor(Number(input.minLevel) || 2));
    const wanted = new Set((input.dungeons ?? []).map(Number));
    if (wanted.size === 0) throw new BadRequestException('Pick at least one dungeon');

    const [season] = await this.conn.execute<Array<{ id: number }>>('select id from season where active limit 1');
    if (!season) throw new BadRequestException('No active season');
    const dungeons = (await this.dungeons() as Array<{ gameZoneId: number; encounterID: number }>)
      .filter((d) => wanted.has(d.gameZoneId));
    if (dungeons.length === 0) throw new BadRequestException('None of these dungeons is in the active season');

    const aliases = dungeons.map((d, i) => `d${i}: encounterRankings(encounterID: ${d.encounterID}, includePrivateLogs: false)`).join('\n');
    const res = await this.scans.wcl.query<{
      characterData: { character: (Record<string, { ranks?: Rank[] } | null> & { classID: number }) | null };
      gameData: { classes: Array<{ id: number; slug: string }> };
    }>(
      `query($n: String!, $s: String!, $r: String!) {
        gameData { classes { id slug } }
        characterData { character(name: $n, serverSlug: $s, serverRegion: $r) { classID ${aliases} } }
      }`,
      { n: who.name, s: who.serverSlug, r: who.region },
    );
    const character = res.data.characterData.character;
    if (!character) {
      throw new NotFoundException(`Character ${who.name}-${who.serverSlug}-${who.region} not found on Warcraft Logs`);
    }

    // Dédoublonnage : la même ligne peut revenir plusieurs fois, et la même run sous deux rapports.
    const found: FoundRun[] = [];
    dungeons.forEach((d, i) => {
      for (const r of character[`d${i}`]?.ranks ?? []) {
        // Rapport supprimé ou devenu privé : la ligne de classement reste, sans code ni fight.
        if (!r.report?.code || r.report.fightID == null) continue;
        if (r.bracketData < minLevel) continue;
        const dupe = found.some((f) =>
          (f.reportCode === r.report.code && f.fightID === r.report.fightID)
          || (f.gameZoneId === d.gameZoneId && Math.abs(f.startedAt.getTime() - r.startTime) < SAME_RUN_MS));
        if (dupe) continue;
        found.push({
          reportCode: r.report.code,
          fightID: r.report.fightID,
          gameZoneId: d.gameZoneId,
          keystoneLevel: r.bracketData,
          medal: r.medal ?? 'none',
          spec: r.spec ?? null,
          startedAt: new Date(r.startTime),
          duration: r.duration,
        });
      }
    });

    const healerSpecId = input.healerSpecId != null
      ? this.healerSpec(Number(input.healerSpecId))
      : this.guessHealerSpec(found, res.data.gameData.classes.find((c) => c.id === character.classID)?.slug);

    // Lot et lignes ensemble ou pas du tout : un lot vide par erreur serait trompeur.
    const id = await this.em.transactional(async (tem) => {
      const conn = tem.getConnection();
      const ctx = tem.getTransactionContext();
      const [batch] = await conn.execute<Array<{ id: number }>>(
        `insert into import_batch (name, character_name, server_slug, server_region, healer_spec_id, season_id, min_level, dungeons, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, now()) returning id`,
        [input.name?.trim() || null, who.name, who.serverSlug, who.region, healerSpecId, season.id, minLevel,
          `{${dungeons.map((d) => d.gameZoneId).join(',')}}`],
        'all', ctx,
      );
      if (found.length > 0) {
        const values = found.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        await conn.execute(
          `insert into import_candidate (batch_id, report_code, fight_id, game_zone_id, keystone_level, medal, spec, started_at, duration)
           values ${values} on conflict do nothing`,
          found.flatMap((f) => [batch!.id, f.reportCode, f.fightID, f.gameZoneId, f.keystoneLevel, f.medal, f.spec, f.startedAt, f.duration]),
          'run', ctx,
        );
      }
      return batch!.id;
    });
    return { id, found: found.length };
  }

  async update(id: number, body: { name?: string | null; healerSpecId?: number | null }): Promise<unknown> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if ('name' in body) {
      sets.push('name = ?');
      params.push(body.name?.trim() || null);
    }
    if ('healerSpecId' in body) {
      sets.push('healer_spec_id = ?');
      params.push(body.healerSpecId == null ? null : this.healerSpec(Number(body.healerSpecId)));
    }
    if (sets.length) await this.conn.execute(`update import_batch set ${sets.join(', ')} where id = ?`, [...params, id]);
    return this.get(id);
  }

  /** Supprime le lot et ses lignes. Les runs importées restent : elles sont à tout le site. */
  async remove(id: number): Promise<void> {
    await this.conn.execute('delete from import_batch where id = ?', [id]);
  }

  /** Retire une clé du lot. La run, si elle a été importée, reste en base. */
  async removeCandidate(batchId: number, candidateId: number): Promise<void> {
    await this.conn.execute('delete from import_candidate where id = ? and batch_id = ?', [candidateId, batchId]);
  }

  /**
   * Importe une clé exactement comme le scan public : même service, même cache (une run
   * déjà en base ne coûte rien). L'échec est gardé sur la ligne pour être relu plus tard.
   */
  async importCandidate(batchId: number, candidateId: number): Promise<{ ok: boolean; error?: string }> {
    const [c] = await this.conn.execute<Array<{ reportCode: string; fightID: number }>>(
      'select report_code as "reportCode", fight_id as "fightID" from import_candidate where id = ? and batch_id = ?',
      [candidateId, batchId],
    );
    if (!c) throw new NotFoundException(`Unknown candidate ${candidateId}`);
    try {
      await this.scans.scan(c.reportCode, c.fightID);
      await this.conn.execute('update import_candidate set last_error = null, last_error_at = null where id = ?', [candidateId]);
      return { ok: true };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await this.conn.execute('update import_candidate set last_error = ?, last_error_at = now() where id = ?', [error, candidateId]);
      return { ok: false, error };
    }
  }

  private healerSpec(id: number): number {
    if (!HEALER_SPECS.some((s) => s.id === id)) throw new BadRequestException(`Spec ${id} is not a healer spec`);
    return id;
  }

  /**
   * Spec de soin la plus jouée sur les clés trouvées, dans la classe du personnage. WCL
   * rend la spec en toutes lettres (« Holy ») : ambigu seul (Paladin ou Priest), d'où la
   * classe. Aucune clé en spec de soin : rien, le lot se renseigne à la main.
   */
  private guessHealerSpec(found: readonly FoundRun[], classSlug: string | undefined): number | null {
    const cls = classSlug ? wowClassByName(classSlug) : undefined;
    if (!cls) return null;
    const counts = new Map<number, number>();
    for (const f of found) {
      const spec = HEALER_SPECS.find((s) => s.classId === cls.id && s.name === f.spec);
      if (spec) counts.set(spec.id, (counts.get(spec.id) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }
}
