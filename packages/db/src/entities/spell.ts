import {
  Collection,
  Entity,
  Enum,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryKey,
  PrimaryKeyProp,
  Property,
  type Ref,
} from '@mikro-orm/core';
import { Boss } from './world.js';

export enum SpellCategory {
  /** Cooldown de dégâts. */
  OFFENSIVE = 'OFFENSIVE',
  /** Réduction de dégâts sur SOI. */
  PERSONAL = 'PERSONAL',
  /** Protection lancée sur un ALLIÉ. */
  EXTERNAL = 'EXTERNAL',
  /** Soin de groupe ou d'urgence. */
  HEALER = 'HEALER',
  /** Accélération de groupe : liste explicite, pas un seuil de cooldown. */
  BLOODLUST = 'BLOODLUST',
  /** Mobilité, contrôle, résurrection — tout ce qui ne rentre pas ailleurs. */
  UTILITY = 'UTILITY',
  /** Sort lancé par un boss. Ne concerne aucune spec. */
  BOSS = 'BOSS',
}

/**
 * Plan §5.2. Pas d'enum de portée : l'appartenance se lit dans les relations.
 * Aucune ligne `SpellSpec` et pas de `boss` ⇒ sort inter-classes, toujours inclus.
 */
@Entity({ tableName: 'spell' })
export class Spell {
  /** `abilityGameID` côté events, `ability.id` côté filterExpression. */
  @PrimaryKey({ type: 'integer', autoincrement: false })
  spellId!: number;

  /** Via `gameData.ability(id)` — ~200 par requête, 1 point. */
  @Property({ type: 'string', length: 128 })
  name!: string;

  /** Nom de fichier Blizzard, jamais une URL. */
  @Property({ type: 'string', length: 128, nullable: true })
  icon?: string;

  /**
   * Nullable : seuls les défensifs sont catégorisés à ce stade (58/239 au seed initial).
   * Un défaut arbitraire serait pire qu'un null — il ferait passer une donnée absente
   * pour une donnée connue.
   */
  @Enum({ items: () => SpellCategory, type: 'string', nullable: true })
  @Index()
  category?: SpellCategory;

  /** Cooldown de base, seedé depuis DB2 `SpellCooldowns`. Ignore talents et haste. */
  @Property({ type: 'integer', nullable: true })
  baseCooldownSec?: number;

  /**
   * Mesuré sur le corpus : min des écarts entre deux casts d'un même sort par un même
   * joueur (NOTES E7). Plus juste que la base — il intègre talents et haste.
   */
  @Property({ type: 'integer', nullable: true })
  cooldownSec?: number;

  /** Sans lui, `cooldownSec` ne vaut rien : un sort lancé deux fois ne dit rien. */
  @Property({ type: 'integer', default: 0 })
  cooldownSamples: number = 0;

  @Property({ type: 'Date', nullable: true })
  cooldownMeasuredAt?: Date;

  /** Renseigné ⇔ sort de boss. */
  @ManyToOne(() => Boss, { ref: true, nullable: true, fieldName: 'boss_encounter_id' })
  @Index()
  boss?: Ref<Boss>;

  /**
   * Type d'event WCL par lequel ce sort se manifeste. `null` = `cast`, le cas de l'immense
   * majorité — on ne précise que l'exception.
   *
   * `applybuff` sert aux cooldowns qui ne s'incantent pas mais s'ACTIVENT : Void
   * Metamorphosis s'obtient en accumulant 50 fragments d'âme et n'émet aucun `cast`.
   *
   * ⚠️ À déclarer sort par sort, jamais à déduire. `applybuff` se déclenche une fois par
   * CIBLE : Fury of the Aspects, lancé 3 fois, produit 71 applybuff sur son lanceur et 3
   * par allié — le marquer ainsi afficherait 80 utilisations pour 3. Même piège pour
   * Rallying Cry, Zephyr et tout sort de groupe.
   */
  @Property({ type: 'string', length: 24, nullable: true })
  filterType?: string;

  /**
   * Annotation de curation, reprise de `boss-spells.json` et transmise jusqu'au front.
   *
   * Ne filtre pas le SCAN — tout ce qui est curé entre dans le filtre WCL — ni le
   * pré-masquage des chips, retiré depuis : cacher au premier rendu des sorts réellement
   * lancés, sans que rien ne l'explique à l'écran, coûtait plus qu'il ne rapportait.
   *
   * ⚠️ En revanche elle DÉCIDE de l'ancrage : seul un sort de boss à `true` sert de point
   * de recalage aux réponses des joueurs (`align.ts`) et devient une cible `u;` valide à
   * l'export ECP. Le passer à `false` retire silencieusement le sort de tous les plans.
   */
  @Property({ type: 'boolean', default: true })
  inTimeline: boolean = true;


  /**
   * HTML du tooltip, mis en cache depuis `nether.wowhead.com/tooltip/spell/:id`.
   * Anglais uniquement pour l'instant — la locale n'est pas modélisée.
   *
   * La base est la source de vérité : on n'interroge Wowhead que si l'entrée manque
   * ou a dépassé le TTL. Le corpus se bonifie donc à l'usage, et une panne de Wowhead
   * dégrade le tooltip sans casser la timeline.
   */
  @Property({ type: 'text', nullable: true })
  tooltipHtml?: string;

  /** Date d'écriture du tooltip. `null` = jamais récupéré. */
  @Property({ type: 'Date', nullable: true })
  tooltipFetchedAt?: Date;

  @OneToMany(() => SpellSpec, (ss) => ss.spell)
  specs = new Collection<SpellSpec>(this);

  [PrimaryKeyProp]?: 'spellId';
}

/**
 * Pivot sort ↔ spec. Un sort de classe génère une ligne par spec de la classe.
 *
 * `specId` est un entier nu, pas une clé étrangère : le référentiel des specs vit en
 * constantes dans `@timeline/shared` (specID Blizzard), pas en base.
 */
@Entity({ tableName: 'spell_spec' })
export class SpellSpec {
  @ManyToOne(() => Spell, { primary: true, ref: true, deleteRule: 'cascade', fieldName: 'spell_id' })
  spell!: Ref<Spell>;

  /** specID Blizzard. L'index qui porte la construction du filtre au scan. */
  @PrimaryKey({ type: 'integer', autoincrement: false })
  @Index()
  specId!: number;

  /**
   * Requalification pour CETTE spec. `null` = on prend `Spell.category`.
   *
   * Un même sort ne joue pas le même rôle selon la spec : Divine Toll soigne en Holy et
   * frappe ailleurs, Lay on Hands est un soin d'urgence en Holy mais un défensif personnel
   * en Protection. On n'annote que l'exception.
   */
  @Enum({ items: () => SpellCategory, type: 'string', nullable: true })
  category?: SpellCategory;

  [PrimaryKeyProp]?: ['spell', 'specId'];
}
