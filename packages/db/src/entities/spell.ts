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

/** Ce que fait un sort de joueur qui répond aux dégâts. Voir `Spell.effect`. */
export enum SpellEffect {
  HEALING = 'HEALING',
  SHIELD = 'SHIELD',
  DR = 'DR',
}

/** Nature des dégâts d'un sort de boss. Voir `Spell.damageType`. */
export enum BossDamageType {
  BURST = 'burst',
  DOT = 'dot',
  /** Gros coup sur le tank : n'appelle que ses défensifs et les externes. */
  TANKBUSTER = 'tankbuster',
  /** Évitable : aucun dégât s'il est bien joué, jamais une ancre. */
  DODGE = 'dodge',
  /** Sans intérêt pour l'alignement, jamais une ancre. */
  IGNORE = 'ignore',
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

  /**
   * Nature des dégâts d'un sort de boss — renseignée ⇔ sort de boss. Décide comment
   * l'alignement y rattache les réponses des joueurs (`api/src/align.ts`) :
   *  - `burst`      : un coup unique, au moment du cast. On se protège AVANT.
   *  - `dot`        : des dégâts étalés après le cast. On soigne et on se protège PENDANT.
   *  - `tankbuster` : un coup unique sur le tank, qui n'appelle que ses réponses à lui.
   *  - `dodge`, `ignore` : rien à quoi répondre, jamais une ancre.
   *
   * Pas de durée : décision de curation, une fenêtre fixe suffit (coupée par la capacité
   * suivante). ⚠️ Les dégâts d'un dot ne sont pas toujours attribués au sort lui-même —
   * Ssscavenging pose un debuff qui frappe sous le nom de Carrion Burst. D'où une saisie
   * manuelle, jamais une déduction des logs.
   */
  @Enum({ items: () => BossDamageType, type: 'string', nullable: true })
  damageType?: BossDamageType;

  /**
   * Ce que fait un sort de joueur qui peut répondre à une capacité de boss (catégorie
   * PERSONAL, EXTERNAL ou HEALER, ou requalifié ainsi pour une spec). Décide du sens de
   * rattachement dans l'alignement :
   *  - `HEALING` soigne : utile avant ou après les dégâts ;
   *  - `SHIELD` absorbe et `DR` réduit : utiles seulement avant les dégâts, ou pendant
   *    un dot.
   * Classé à la main d'après le tooltip, sort par sort — jamais déduit.
   */
  @Enum({ items: () => SpellEffect, type: 'string', nullable: true })
  effect?: SpellEffect;

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
   * Sort de boss PLANIFIABLE : copie du drapeau `allowedInPlan` de l'addon (`Data/Content.lua`),
   * repris de `boss-spells.json`. Rien à voir avec `allowInTimeline` de l'addon, qui ne règle
   * que l'affichage des barres en combat et que le site n'importe pas.
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
  allowedInPlan: boolean = true;


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

/**
 * Identifiant sous lequel un sort de boss apparaît dans le log de combat, quand il diffère
 * de celui de la curation.
 *
 * La curation (`boss-spells.json`) porte les identifiants de l'ADDON : ce sont eux que
 * l'export ECP doit émettre. Mais l'addon minute parfois l'event serveur d'une capacité,
 * et le log enregistre le cast sous un autre id — Ravenous Bellow : 1235118 côté addon,
 * 1234681 dans le log. Sans alias, le filtre de scan ne demande jamais le second, et la
 * capacité manque à la timeline sans le moindre avertissement.
 *
 * Le scan ramène tout cast reçu sous un alias à l'identifiant curé : en aval, plus
 * personne ne voit les identifiants du log.
 */
@Entity({ tableName: 'spell_alias' })
export class SpellAlias {
  /** `abilityGameID` tel que Warcraft Logs l'enregistre. Clé : un alias ne désigne qu'un sort. */
  @PrimaryKey({ type: 'integer', autoincrement: false })
  aliasId!: number;

  /** Le sort curé — l'identifiant de l'addon. */
  @ManyToOne(() => Spell, { ref: true, deleteRule: 'cascade', fieldName: 'spell_id', index: true })
  spell!: Ref<Spell>;
}
