import {
  Collection,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryKey,
  PrimaryKeyProp,
  Property,
  Unique,
  type Ref,
} from '@mikro-orm/core';

/**
 * Référentiel du monde (plan §5.1). Ce qui le justifie :
 *  - les boss M+ ne sont résolubles nulle part dans `worldData` (NOTES E2/E14) ;
 *  - l'`encounterID` d'un donjon CHANGE à chaque saison, seul `gameZone.id` est stable.
 */

@Entity({ tableName: 'season' })
export class Season {
  @PrimaryKey({ type: 'integer' })
  id!: number;

  /** zone WCL : 47 = M+ S1, 55 = M+ S2 */
  @Property({ type: 'integer' })
  @Unique()
  zoneId!: number;

  @Property({ type: 'string', length: 64 })
  name!: string;

  @Property({ type: 'integer' })
  expansionId!: number;

  @Property({ type: 'boolean', default: false })
  active: boolean = false;

  @OneToMany(() => DungeonSeason, (ds) => ds.season)
  dungeons = new Collection<DungeonSeason>(this);
}

@Entity({ tableName: 'dungeon' })
export class Dungeon {
  /** `fight.gameZone.id` — STABLE entre saisons, contrairement à l'encounterID. */
  @PrimaryKey({ type: 'integer', autoincrement: false })
  gameZoneId!: number;

  @Property({ type: 'string', length: 64 })
  @Unique()
  slug!: string;

  @Property({ type: 'string', length: 128 })
  name!: string;

  /**
   * `dID` du format d'échange ECP (`SEAT_TRIUMVIRATE`, `ALGETHAR_ACADEMY`…).
   *
   * Curé, jamais dérivé : le jeton perd des mots du nom réel — « Seat of the Triumvirate »
   * donne `SEAT_TRIUMVIRATE`, pas `SEAT_OF_THE_TRIUMVIRATE`. Nullable parce qu'un donjon
   * découvert au scan n'en a pas tant qu'il n'est pas curé.
   */
  @Property({ type: 'string', length: 48, nullable: true })
  @Unique()
  ecpId?: string;

  @OneToMany(() => DungeonSeason, (ds) => ds.dungeon)
  seasons = new Collection<DungeonSeason>(this);

  @OneToMany(() => Boss, (b) => b.dungeon)
  bosses = new Collection<Boss>(this);

  [PrimaryKeyProp]?: 'gameZoneId';
}

/** L'encounterID saisonnier d'un donjon. Ruby Life Pools : 12521 → 62521 → 112521. */
@Entity({ tableName: 'dungeon_season' })
export class DungeonSeason {
  @ManyToOne(() => Dungeon, { primary: true, ref: true })
  dungeon!: Ref<Dungeon>;

  @ManyToOne(() => Season, { primary: true, ref: true })
  season!: Ref<Season>;

  /** Ce que porte `fight.encounterID`. */
  @Property({ type: 'integer' })
  @Unique()
  encounterID!: number;

  [PrimaryKeyProp]?: ['dungeon', 'season'];
}

@Entity({ tableName: 'boss' })
export class Boss {
  /** `dungeonPull.encounterID` — introuvable via worldData. */
  @PrimaryKey({ type: 'integer', autoincrement: false })
  encounterID!: number;

  /**
   * `masterData.actors[subType=Boss].gameID`. Indépendant de la saison, donc pont durable
   * si les encounterID de boss s'avéraient saisonniers comme ceux des donjons.
   */
  @Property({ type: 'integer', nullable: true })
  @Unique()
  npcGameId?: number;

  @ManyToOne(() => Dungeon, { ref: true, fieldName: 'dungeon_id' })
  dungeon!: Ref<Dungeon>;

  @Property({ type: 'string', length: 64 })
  @Unique()
  slug!: string;

  /** Via `gameData.npc(npcGameId)`, canonique. */
  @Property({ type: 'string', length: 128 })
  name!: string;

  [PrimaryKeyProp]?: 'encounterID';
}
