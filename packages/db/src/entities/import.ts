import {
  Collection, Entity, Index, ManyToOne, OneToMany, PrimaryKey, Property, Unique, type Ref,
} from '@mikro-orm/core';
import { Dungeon, Season } from './world.js';

/**
 * Lot d'import de masse : toutes les clés d'UN personnage, trouvées sur Warcraft Logs,
 * au-dessus d'un niveau, sur une sélection de donjons. Sert de catégorie pour regrouper
 * les runs importées ensemble.
 *
 * Les clés trouvées vivent dans `ImportCandidate` ; les runs importées, elles, restent
 * dans `scanned_run` comme n'importe quel scan public.
 */
@Entity({ tableName: 'import_batch' })
export class ImportBatch {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** Libellé libre (« Eiiko - Holy S2 »). Vide : on affiche `Nom-Royaume-Région`. */
  @Property({ type: 'string', length: 128, nullable: true })
  name?: string;

  /** Tels que saisis pour la recherche, normalisés : nom tel quel, royaume en slug WCL. */
  @Property({ type: 'string', length: 64 })
  characterName!: string;

  @Property({ type: 'string', length: 64 })
  serverSlug!: string;

  /** `EU`, `US`, `KR`, `TW`, `CN`. */
  @Property({ type: 'string', length: 4 })
  serverRegion!: string;

  /**
   * specID Blizzard de la spec de soin jouée, résolue contre `WOW_SPECS` de `@timeline/shared`
   * (pas de table `spec` en base). Pré-remplie avec la spec la plus jouée sur les clés
   * trouvées, corrigeable à la main.
   */
  @Property({ type: 'integer', nullable: true })
  healerSpecId?: number;

  @ManyToOne(() => Season, { ref: true, fieldName: 'season_id' })
  season!: Ref<Season>;

  @Property({ type: 'integer' })
  minLevel!: number;

  /** `game_zone_id` des donjons interrogés. */
  @Property({ type: 'array', columnType: 'int[]' })
  dungeons: number[] = [];

  @Property({ type: 'Date', onCreate: () => new Date() })
  createdAt: Date = new Date();

  @OneToMany(() => ImportCandidate, (c) => c.batch)
  candidates = new Collection<ImportCandidate>(this);
}

/**
 * Une clé trouvée pour un lot, pas encore forcément scannée.
 *
 * ⚠️ Aucune clé étrangère vers `scanned_run` : la ligne existe AVANT la run. Le lien est
 * logique, par `(report_code, fight_id)` — la clé primaire de `scanned_run` — et le statut
 * « importée » se calcule par jointure plutôt que d'être stocké. Il reste ainsi toujours
 * juste : une run déjà scannée par un visiteur apparaît importée d'office, une run purgée
 * redevient à importer, et deux lots qui partagent une clé pointent sur la même run.
 */
@Entity({ tableName: 'import_candidate' })
@Unique({ properties: ['batch', 'reportCode', 'fightID'] })
@Index({ properties: ['reportCode', 'fightID'] })
export class ImportCandidate {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  @ManyToOne(() => ImportBatch, { ref: true, deleteRule: 'cascade', fieldName: 'batch_id' })
  batch!: Ref<ImportBatch>;

  @Property({ type: 'string', length: 32 })
  reportCode!: string;

  @Property({ type: 'integer' })
  fightID!: number;

  @ManyToOne(() => Dungeon, { ref: true, fieldName: 'game_zone_id' })
  dungeon!: Ref<Dungeon>;

  @Property({ type: 'integer' })
  keystoneLevel!: number;

  /** `gold` / `silver` / `bronze` : chronométrée ; `none` : clé ratée. */
  @Property({ type: 'string', length: 16 })
  medal!: string;

  /** Spec jouée par le personnage, en toutes lettres comme WCL la rend (`Holy`). */
  @Property({ type: 'string', length: 32, nullable: true })
  spec?: string;

  @Property({ type: 'Date' })
  startedAt!: Date;

  @Property({ type: 'integer' })
  duration!: number;

  /** Dernier échec d'import : ce que la jointure ne peut pas dire. Vidé au succès. */
  @Property({ type: 'text', nullable: true })
  lastError?: string;

  @Property({ type: 'Date', nullable: true })
  lastErrorAt?: Date;
}
