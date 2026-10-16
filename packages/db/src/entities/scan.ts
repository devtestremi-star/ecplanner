import {
  Collection,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryKey,
  PrimaryKeyProp,
  Property,
  type Ref,
} from '@mikro-orm/core';
import { Boss, Dungeon, Season } from './world.js';

/** Types d'events persistés. Voir le commentaire de `ScannedBoss.events`. */
export type StoredEventType = 'cast' | 'applybuff';

/** Un event compacté : [timestamp, sourceID, abilityGameID, type]. */
export type CompactEvent = [number, number, number, StoredEventType];

/**
 * Identité d'un joueur dans UNE run, figée au moment du scan.
 *
 * En JSON et non en tables : `sourceID` est local au rapport, et le reste — nom, royaume,
 * spec, talents — décrit un instant, pas une entité durable. Un joueur qui change de nom
 * ou de royaume ne doit pas réécrire ses runs passées.
 *
 * `classId` et `specId` se résolvent contre les constantes de `@timeline/shared`.
 */
export interface RunParticipant {
  /** Local au rapport — le pont vers les events, jamais un id durable. */
  sourceID: number;
  /** Identifiant global WCL : le seul lien entre deux runs d'un même joueur. */
  guid: number;
  name: string;
  server: string;
  region: string;
  classId: number;
  /** specID Blizzard, depuis `CombatantInfo.specID`. */
  specId: number;
  role: 'tank' | 'healer' | 'dps' | null;
  /** `[{ id, rank, nodeID }]` — varie d'une run à l'autre, même à spec identique. */
  talentTree: Array<{ id: number; rank: number; nodeID: number }> | null;
  /**
   * itemID des trinkets équipés (slots 13/14), emplacements vides exclus.
   *
   * Certains défensifs plaçables ne viennent ni d'un talent ni d'une spé mais d'un objet
   * — le format les transporte par le champ `items` du `r;` (PLAN_FORMAT_V2 §11.9). Comme
   * le reste de cette structure, c'est un instantané : `null` pour les runs scannées avant
   * l'ajout du champ, et pour un joueur sans CombatantInfo.
   */
  trinkets: number[] | null;
}

/**
 * Plan §5.3. Pas de table `Report` : `reportCode` est une référence d'origine, pas une
 * entité. Une URL sans fight de run est refusée en amont (§4.7).
 */
@Entity({ tableName: 'scanned_run' })
@Index({ properties: ['season', 'dungeonEncounterID', 'keystoneLevel'] })
@Index({ properties: ['dungeon', 'keystoneLevel'] }) // comparaison INTER-saisons
@Index({ properties: ['season', 'scannedAt'] })
export class ScannedRun {
  @PrimaryKey({ type: 'string', length: 32 })
  reportCode!: string;

  /** En M+, le fight EST la run (NOTES E1). */
  @PrimaryKey({ type: 'integer', autoincrement: false })
  fightID!: number;

  @ManyToOne(() => Season, { ref: true, fieldName: 'season_id' })
  season!: Ref<Season>;

  /** `fight.encounterID` — SAISONNIER. */
  @Property({ type: 'integer' })
  dungeonEncounterID!: number;

  /** `fight.gameZone.id` — l'identité stable du donjon. */
  @ManyToOne(() => Dungeon, { ref: true, fieldName: 'game_zone_id' })
  dungeon!: Ref<Dungeon>;

  /** Non nullables : leur présence EST le critère de validation d'une run M+ (§4.7). */
  @Property({ type: 'integer' })
  keystoneLevel!: number;

  @Property({ type: 'integer' })
  keystoneTime!: number;

  /** Nombre de chronos ; 0 = clé non validée. */
  @Property({ type: 'integer' })
  keystoneBonus!: number;

  @Property({ type: 'array', columnType: 'int[]' })
  keystoneAffixes: number[] = [];

  /** Le seul kill fiable est au niveau run (NOTES E1). */
  @Property({ type: 'boolean' })
  kill!: boolean;

  /**
   * ⚠️ Seul ancrage absolu du système : `report.startTime + fight.startTime`.
   * Sans lui les timestamps relatifs sont orphelins, puisqu'on ne stocke pas le rapport.
   */
  @Property({ type: 'Date' })
  startedAt!: Date;

  /** Relatif au rapport — conservé pour recalculer les offsets. */
  @Property({ type: 'integer' })
  startTime!: number;

  @Property({ type: 'integer' })
  duration!: number;

  /**
   * Les 5 joueurs de la run, figés au moment du scan.
   * Pas d'index : la recherche est écartée pour l'instant. Le jour où elle revient,
   * un index GIN rend `participants @> '[{"guid": …}]'` interrogeable.
   */
  @Property({ type: 'json' })
  participants: RunParticipant[] = [];

  @Property({ type: 'integer' })
  spellSetVersion!: number;

  @Property({ type: 'Date', onCreate: () => new Date() })
  scannedAt: Date = new Date();

  @OneToMany(() => ScannedBoss, (b) => b.run)
  bosses = new Collection<ScannedBoss>(this);

  [PrimaryKeyProp]?: ['reportCode', 'fightID'];
}

@Entity({ tableName: 'scanned_boss' })
export class ScannedBoss {
  @ManyToOne(() => ScannedRun, {
    primary: true, ref: true, deleteRule: 'cascade',
    fieldNames: ['report_code', 'fight_id'],
  })
  run!: Ref<ScannedRun>;

  /** Position parmi les `dungeonPulls` à `encounterID !== 0`. */
  @PrimaryKey({ type: 'integer', autoincrement: false })
  orderIndex!: number;

  /** `dungeonPull.id` — a des trous, ne jamais l'utiliser comme ordre. */
  @Property({ type: 'integer' })
  pullId!: number;

  @ManyToOne(() => Boss, { ref: true, fieldName: 'encounter_id', index: true })
  boss!: Ref<Boss>;

  /** Relatif au rapport. */
  @Property({ type: 'integer' })
  startTime!: number;

  @Property({ type: 'integer' })
  duration!: number;

  /**
   * Events de CETTE fenêtre de boss, compactés.
   *
   * On garde `cast` ET `applybuff`. Le second n'est pas redondant : certains cooldowns
   * ne s'incantent pas, ils s'ACTIVENT — Void Metamorphosis (1217607) du Devourer
   * s'obtient en accumulant 50 fragments d'âme et n'émet aucun `cast`, seulement 21
   * `applybuff` sur une run. Sans lui, ces sorts sont invisibles.
   *
   * ⚠️ Pour un sort normal, les deux coexistent : Barkskin émet un `cast` PUIS un
   * `applybuff`. Le dédoublonnage se fait à la lecture, pas au stockage — la base garde
   * ce que WCL a dit.
   *
   * Le trash reste écarté (§5.6), et ça n'est pas réversible sans re-scan.
   */
  @Property({ type: 'json' })
  events: CompactEvent[] = [];

  [PrimaryKeyProp]?: ['run', 'orderIndex'];
}

@Entity({ tableName: 'scan_job' })
@Index({ properties: ['status', 'requestedAt'] })
export class ScanJob {
  /** `${reportCode}-${fightID}` — ':' interdit par BullMQ. */
  @PrimaryKey({ type: 'string', length: 64 })
  id!: string;

  @Property({ type: 'string', length: 16 })
  status!: string;

  @Property({ type: 'text', nullable: true })
  error?: string;

  @Property({ type: 'Date', onCreate: () => new Date() })
  requestedAt: Date = new Date();

  @Property({ type: 'Date', nullable: true })
  completedAt?: Date;
}
