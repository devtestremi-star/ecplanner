import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, Body, Controller, Get, Header, NotFoundException, Param, Post, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ScannedBoss, ScannedRun, TraitEntry } from '@timeline/db';
import { NoBossPullError, NotAMythicPlusRunError } from '@timeline/scanner';
import { wowClass, wowSpec } from '@timeline/shared';
import { InvalidRunUrlError, parseRunUrl, ReportNotAccessibleError } from '@timeline/wcl';
import { alignedOffsets, type SpellFacts } from './align.js';
import { buildPlanText, buildPlanWire, IncoherentSpecError, NoHealerError } from './ecp/build-plan.js';
import { EcpPlanError, fingerprint } from './ecp/format.js';
import { ScanService } from './scan.service.js';
import { WowheadService } from './wowhead.service.js';

@Controller()
export class RunsController {
  constructor(
    private readonly em: EntityManager,
    private readonly scans: ScanService,
    private readonly wowhead: WowheadService,
  ) {}

  /**
   * Scan direct, sans file. Une run de 30 min prend ~1,6 s et ~5 points.
   * Étage 1 de la validation (parsing) : aucun appel réseau, donc 0 point.
   */
  @Post('scan')
  async scan(@Body() body: { url?: string; force?: boolean }): Promise<unknown> {
    if (!body?.url) throw new BadRequestException('Champ `url` manquant');
    const force = body.force === true;

    let parsed;
    try {
      parsed = parseRunUrl(body.url);
    } catch (err) {
      if (err instanceof InvalidRunUrlError) {
        throw new BadRequestException({ reason: err.reason, message: err.message });
      }
      throw err;
    }

    try {
      return await this.scans.scan(parsed.reportCode, parsed.fight, force);
    } catch (err) {
      // Erreurs permanentes : inutile de faire réessayer l'appelant.
      if (err instanceof NotAMythicPlusRunError || err instanceof NoBossPullError || err instanceof ReportNotAccessibleError) {
        throw new BadRequestException({ reason: err.name, message: err.message });
      }
      throw err;
    }
  }

  /**
   * Ce qui a été scanné, du plus récent au plus ancien.
   * La recherche (par joueur, spec, donjon) est écartée pour l'instant.
   */
  @Get('runs')
  async list(@Query('limit') limit?: string): Promise<unknown> {
    // `events` pèse ~1 Ko par boss : jamais de SELECT * sur un listing (plan §5.6).
    const runs = await this.em.find(ScannedRun, {}, {
      fields: ['reportCode', 'fightID', 'dungeonEncounterID', 'keystoneLevel', 'keystoneBonus', 'kill', 'startedAt', 'duration'],
      orderBy: { startedAt: 'desc' },
      // `Number('abc')` vaut NaN et un négatif passait tel quel jusqu'à l'ORM.
      limit: Math.min(Math.max(1, Number(limit) || 50), 200),
    });
    return { count: runs.length, runs };
  }

  /**
   * Export `ecp;2` de la run, en texte brut prêt à coller dans l'addon.
   *
   * Rien n'est persisté : le plan est dérivé à chaque appel des casts déjà stockés. Les
   * réglages d'alignement, la curation `inTimeline` et le catalogue de défensifs changent
   * donc le résultat sans re-scan ni migration.
   *
   * `?boss=<encID>` produit un import de boss seul (`kind=boss`), qui ÉCRASE le plan de ce
   * boss dans la variante ouverte côté addon (§11.6). Sans le paramètre, c'est le donjon
   * entier.
   *
   * Émet l'enveloppe `ecp64:` par défaut (§5bis) : un bloc opaque monoligne, insensible à
   * une sélection qui raterait la dernière ligne — or c'est `k;`, le contrôle d'intégrité.
   * `?raw=1` rend le document `ecp;2` nu, pour le diagnostic.
   */
  @Get('runs/:reportCode/:fightID/ecp')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async ecpExport(
    @Param('reportCode') reportCode: string,
    @Param('fightID') fightID: string,
    @Query('boss') boss?: string,
    @Query('raw') raw?: string,
    @Res({ passthrough: true }) res?: FastifyReply,
  ): Promise<string> {
    const run = await this.em.findOne(
      ScannedRun,
      { reportCode, fightID: Number(fightID) },
      { populate: ['dungeon'] },
    );
    if (!run) throw new NotFoundException(`${reportCode}-${fightID} non scanné`);

    const bosses = await this.em.find(ScannedBoss, { run }, { populate: ['boss'], orderBy: { orderIndex: 'asc' } });

    /**
     * `?boss=` doit désigner un boss RÉELLEMENT scanné dans cette run. Sans ce contrôle,
     * `?boss=abc` produit `b;NaN` et `?boss=9999` un plan à zéro assignation : deux
     * réponses 200 que l'addon rejette, là où l'appelant mérite un 400 immédiat.
     */
    let onlyEncounterID: number | undefined;
    if (boss !== undefined) {
      onlyEncounterID = Number(boss);
      if (!Number.isInteger(onlyEncounterID)) throw new BadRequestException(`boss « ${boss} » : entier attendu`);
      const known = bosses.map((b) => b.boss.unwrap().encounterID);
      if (!known.includes(onlyEncounterID)) {
        throw new BadRequestException(`boss ${onlyEncounterID} absent de cette run (présents : ${known.join(', ')})`);
      }
    }

    const catalog = await this.wowhead.getCatalog();
    const spells = new Map<number, SpellFacts>(
      catalog.map((s) => [s.spellId, { category: s.category, bySpec: s.bySpec, inTimeline: s.inTimeline }]),
    );

    /**
     * Talents : WCL ne rend que des identifiants de nœuds, jamais de spellID. La table
     * `trait_entry` est la seule voie. On ne charge que les nœuds réellement présents.
     */
    const nodeIds = [...new Set(run.participants.flatMap((p) => (p.talentTree ?? []).map((t) => t.id)))];
    const talentSpells = new Map<number, number[]>();
    if (nodeIds.length > 0) {
      for (const row of await this.em.find(TraitEntry, { nodeEntryId: { $in: nodeIds } })) {
        talentSpells.set(row.nodeEntryId, [...(talentSpells.get(row.nodeEntryId) ?? []), row.spellId]);
      }
    }

    try {
      // Valeur testée, pas simple présence : `?raw=0` doit rendre l'enveloppe.
      const emit = raw === '1' || raw === 'true' ? buildPlanText : buildPlanWire;
      const out = emit({
        zoneID: run.dungeon.unwrap().gameZoneId,
        dungeonName: run.dungeon.unwrap().name,
        keystoneLevel: run.keystoneLevel,
        startedAt: run.startedAt,
        participants: run.participants,
        bosses: bosses.map((b) => ({
          encounterID: b.boss.unwrap().encounterID,
          startTime: b.startTime,
          events: b.events,
        })),
        spells,
        talentSpells,
        ...(onlyEncounterID !== undefined ? { onlyEncounterID } : {}),
      });
      // Empreinte en en-tête, pas dans le corps : le corps doit rester collable tel quel.
      // Elle permet de vérifier de l'autre côté qu'aucun caractère n'a été mangé en route.
      void res?.header('X-Ecp-Length', String(out.length));
      void res?.header('X-Ecp-Fingerprint', fingerprint(out));
      return out;
    } catch (err) {
      // Conditions de DONNÉES sur lesquelles l'appelant peut agir : jamais un 500 muet.
      if (err instanceof NoHealerError || err instanceof IncoherentSpecError || err instanceof EcpPlanError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  /** Payload complet pour la timeline. */
  @Get('runs/:reportCode/:fightID')
  async detail(@Param('reportCode') reportCode: string, @Param('fightID') fightID: string): Promise<unknown> {
    const run = await this.em.findOne(
      ScannedRun,
      { reportCode, fightID: Number(fightID) },
      { populate: ['dungeon', 'season'] },
    );
    if (!run) throw new NotFoundException(`${reportCode}-${fightID} non scanné`);

    const bosses = await this.em.find(
      ScannedBoss,
      { run },
      { populate: ['boss'], orderBy: { orderIndex: 'asc' } },
    );

    /**
     * Le catalogue porte catégories, requalifications par spec et `inTimeline` — tout ce
     * dont l'alignement a besoin. Une seule lecture pour toute la run.
     */
    const catalog = await this.wowhead.getCatalog();
    const spells = new Map<number, SpellFacts>(
      catalog.map((s) => [s.spellId, { category: s.category, bySpec: s.bySpec, inTimeline: s.inTimeline }]),
    );
    const roleBySource = new Map(run.participants.map((p) => [p.sourceID, p.role]));
    const specBySource = new Map(run.participants.map((p) => [p.sourceID, p.specId]));

    return {
      run: {
        reportCode: run.reportCode, fightID: run.fightID,
        dungeon: { gameZoneId: run.dungeon.unwrap().gameZoneId, name: run.dungeon.unwrap().name },
        season: run.season.unwrap().name,
        keystoneLevel: run.keystoneLevel, keystoneBonus: run.keystoneBonus,
        kill: run.kill, startedAt: run.startedAt, duration: run.duration,
      },
      // Classes et specs viennent des constantes, plus de jointure.
      participants: [...run.participants]
        .sort((a, b) => a.sourceID - b.sourceID)
        .map((p) => ({
          sourceID: p.sourceID, role: p.role,
          guid: p.guid, name: p.name, server: p.server, region: p.region,
          class: wowClass(p.classId)?.name ?? null,
          color: wowClass(p.classId)?.color ?? null,
          // Nom de fichier, pas une URL : le front choisit la taille servie par le CDN.
          classIcon: wowClass(p.classId)?.icon ?? null,
          specId: p.specId,
          spec: wowSpec(p.specId)?.name ?? null,
          // null tant que la spec n'est pas curée — 6 des 40 le sont.
          specIcon: wowSpec(p.specId)?.icon ?? null,
        })),
      bosses: bosses.map((b) => {
        // Offsets recalculés ici : la base stocke le timestamp relatif au rapport.
        const casts = b.events.map(([ts, src, ability, type]) => ({
          offsetBoss: ts - b.startTime,
          offsetRun: ts - run.startTime,
          sourceID: src,
          abilityGameID: ability,
          /** 'applybuff' = cooldown activé sans incantation, pas lancé. */
          type,
        }));
        // AJOUTÉ, jamais substitué à `offsetBoss` : le front bascule entre les deux, et
        // tout calcul en aval doit pouvoir retrouver l'instant réel.
        const aligned = alignedOffsets(casts, { roleBySource, specBySource, spells });

        return {
          orderIndex: b.orderIndex,
          encounterID: b.boss.unwrap().encounterID,
          name: b.boss.unwrap().name,
          /** Position du boss dans la run, en ms depuis son début. */
          offsetRun: b.startTime - run.startTime,
          duration: b.duration,
          casts: casts.map((c, i) => ({ ...c, ecp_timestamp: aligned[i] ?? null })),
        };
      }),
    };
  }
}
