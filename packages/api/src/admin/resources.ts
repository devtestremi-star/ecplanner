import type { EntityClass } from '@mikro-orm/core';
import {
  Boss, Dungeon, DungeonSeason, ScanJob, ScannedBoss, ScannedRun, Season, Spell, SpellCategory, SpellSpec,
} from '@timeline/db';
import { WOW_SPECS, wowClass, wowSpec } from '@timeline/shared';

/**
 * Registre de l'admin : une entrée par table, y compris les deux pivots.
 *
 * Un seul contrôleur générique sert les 9 tables. Ce qui les distingue tient
 * entièrement ici — le contrôleur ne connaît aucune entité par son nom.
 */

export type FieldKind =
  | 'integer' | 'string' | 'text' | 'boolean' | 'date' | 'enum' | 'json' | 'int-array' | 'relation';

export interface FieldDef {
  name: string;
  kind: FieldKind;
  label: string;
  /** Fait partie de la clé primaire — donc non modifiable après création. */
  pk?: boolean;
  /** PK générée par la base (`serial`) : à ne pas demander en création. */
  generated?: boolean;
  required?: boolean;
  /** Écrit par le scanner ou l'ORM, jamais à la main. */
  readonly?: boolean;
  /** Colonne affichée par défaut dans le tableau. */
  listed?: boolean;
  /** Entre dans le `?q=`. Seuls les champs texte le sont. */
  searchable?: boolean;
  /** Filtrable par query param homonyme. */
  filterable?: boolean;
  /** Exclu des listings : payload lourd (JSON de casts, participants). */
  heavy?: boolean;
  enumValues?: readonly string[];
  /** Liste de valeurs connue hors base — évite de taper un identifiant Blizzard à la main. */
  choices?: readonly { value: number | string; label: string }[];
  /** Clé du registre visée par la relation. */
  target?: string;
  maxLength?: number;
  help?: string;
}

export interface ResourceDef {
  /** Segment d'URL, côté API comme côté front. */
  key: string;
  entity: EntityClass<object>;
  table: string;
  label: string;
  /** Pluriel affiché dans la navigation. */
  labelPlural: string;
  /** Table de jointure : pas de route dédiée dans l'admin, éditée depuis son parent. */
  pivot?: boolean;
  /** Ordre des colonnes de la PK dans l'id encodé (`a~b`). */
  pk: readonly string[];
  fields: readonly FieldDef[];
  defaultSort: { field: string; order: 'asc' | 'desc' };
  /** Construit le libellé d'une ligne (sélecteurs de relation, fils d'Ariane). */
  labelOf: (row: Record<string, unknown>) => string;
  description?: string;
}

/** Séparateur des PK composites dans les URL. Absent des reportCode WCL (alphanumériques). */
export const ID_SEP = '~';

const dateField = (name: string, label: string, extra: Partial<FieldDef> = {}): FieldDef =>
  ({ name, kind: 'date', label, ...extra });

/** Les specs ne sont pas en base (§ constantes `@timeline/shared`) : on les injecte ici. */
const SPEC_CHOICES = [...WOW_SPECS]
  .map((s) => ({ value: s.id, label: `${wowClass(s.classId)?.name ?? '?'} — ${s.name}` }))
  .sort((a, b) => a.label.localeCompare(b.label));

export const RESOURCES: readonly ResourceDef[] = [
  {
    key: 'seasons',
    entity: Season,
    table: 'season',
    label: 'Saison',
    labelPlural: 'Saisons',
    pk: ['id'],
    defaultSort: { field: 'id', order: 'asc' },
    description: 'Une zone WCL M+ par saison. `active` pilote le scan par défaut.',
    labelOf: (r) => String(r.name ?? r.id),
    fields: [
      { name: 'id', kind: 'integer', label: 'ID', pk: true, generated: true, listed: true },
      { name: 'zoneId', kind: 'integer', label: 'Zone WCL', required: true, listed: true, filterable: true, help: '47 = M+ S1, 55 = M+ S2' },
      { name: 'name', kind: 'string', label: 'Nom', required: true, listed: true, searchable: true, maxLength: 64 },
      { name: 'expansionId', kind: 'integer', label: 'Extension', required: true, listed: true, filterable: true },
      { name: 'active', kind: 'boolean', label: 'Active', listed: true, filterable: true },
    ],
  },
  {
    key: 'dungeons',
    entity: Dungeon,
    table: 'dungeon',
    label: 'Donjon',
    labelPlural: 'Donjons',
    pk: ['gameZoneId'],
    defaultSort: { field: 'name', order: 'asc' },
    description: "`gameZoneId` est l'identité stable du donjon ; l'encounterID, lui, change à chaque saison.",
    labelOf: (r) => String(r.name ?? r.gameZoneId),
    fields: [
      { name: 'gameZoneId', kind: 'integer', label: 'gameZone ID', pk: true, required: true, listed: true },
      { name: 'slug', kind: 'string', label: 'Slug', required: true, listed: true, searchable: true, maxLength: 64 },
      { name: 'name', kind: 'string', label: 'Nom', required: true, listed: true, searchable: true, maxLength: 128 },
    ],
  },
  {
    key: 'dungeon-seasons',
    entity: DungeonSeason,
    table: 'dungeon_season',
    label: 'Donjon × Saison',
    labelPlural: 'Donjons × Saisons',
    pivot: true,
    pk: ['dungeon', 'season'],
    defaultSort: { field: 'encounterID', order: 'asc' },
    description: "L'encounterID saisonnier d'un donjon.",
    labelOf: (r) => `#${r.encounterID}`,
    fields: [
      { name: 'dungeon', kind: 'relation', label: 'Donjon', target: 'dungeons', pk: true, required: true, listed: true, filterable: true },
      { name: 'season', kind: 'relation', label: 'Saison', target: 'seasons', pk: true, required: true, listed: true, filterable: true },
      { name: 'encounterID', kind: 'integer', label: 'encounterID', required: true, listed: true, filterable: true },
    ],
  },
  {
    key: 'bosses',
    entity: Boss,
    table: 'boss',
    label: 'Boss',
    labelPlural: 'Boss',
    pk: ['encounterID'],
    defaultSort: { field: 'name', order: 'asc' },
    description: "`encounterID` vient de `dungeonPull` ; `npcGameId` est le pont durable vers gameData.",
    labelOf: (r) => String(r.name ?? r.encounterID),
    fields: [
      { name: 'encounterID', kind: 'integer', label: 'encounterID', pk: true, required: true, listed: true },
      { name: 'npcGameId', kind: 'integer', label: 'NPC gameID', listed: true, filterable: true },
      { name: 'dungeon', kind: 'relation', label: 'Donjon', target: 'dungeons', required: true, listed: true, filterable: true },
      { name: 'slug', kind: 'string', label: 'Slug', required: true, listed: true, searchable: true, maxLength: 64 },
      { name: 'name', kind: 'string', label: 'Nom', required: true, listed: true, searchable: true, maxLength: 128 },
    ],
  },
  {
    key: 'spells',
    entity: Spell,
    table: 'spell',
    label: 'Sort',
    labelPlural: 'Sorts',
    pk: ['spellId'],
    defaultSort: { field: 'name', order: 'asc' },
    description: 'Aucune spec et aucun boss ⇒ sort inter-classes, toujours inclus au scan.',
    labelOf: (r) => String(r.name ?? r.spellId),
    fields: [
      { name: 'spellId', kind: 'integer', label: 'Spell ID', pk: true, required: true, listed: true },
      { name: 'name', kind: 'string', label: 'Nom', required: true, listed: true, searchable: true, maxLength: 128 },
      { name: 'icon', kind: 'string', label: 'Icône', searchable: true, maxLength: 128, help: 'Nom de fichier Blizzard, jamais une URL.' },
      { name: 'category', kind: 'enum', label: 'Catégorie', listed: true, filterable: true, enumValues: Object.values(SpellCategory) },
      { name: 'baseCooldownSec', kind: 'integer', label: 'CD de base (s)', help: 'DB2 SpellCooldowns — ignore talents et haste.' },
      { name: 'cooldownSec', kind: 'integer', label: 'CD mesuré (s)', listed: true, help: 'Min des écarts entre deux casts, mesuré sur le corpus.' },
      { name: 'cooldownSamples', kind: 'integer', label: 'Échantillons', listed: true },
      dateField('cooldownMeasuredAt', 'Mesuré le'),
      { name: 'boss', kind: 'relation', label: 'Boss', target: 'bosses', listed: true, filterable: true, help: 'Renseigné ⇔ sort de boss.' },
      {
        name: 'filterType', kind: 'string', label: "Type d'event", listed: true, filterable: true, maxLength: 24,
        help: "Vide = `cast`, le cas de l'immense majorité. `applybuff` pour les cooldowns qui s'activent sans s'incanter — à déclarer sort par sort, jamais à déduire.",
      },
    ],
  },
  {
    key: 'spell-specs',
    entity: SpellSpec,
    table: 'spell_spec',
    label: 'Sort × Spec',
    labelPlural: 'Sorts × Specs',
    pivot: true,
    pk: ['spell', 'specId'],
    defaultSort: { field: 'specId', order: 'asc' },
    description: '`specId` est un specID Blizzard nu — le référentiel des specs vit en constantes.',
    labelOf: (r) => {
      const spec = wowSpec(Number(r.specId));
      return spec ? `${wowClass(spec.classId)?.name ?? '?'} — ${spec.name}` : `spec ${r.specId}`;
    },
    fields: [
      { name: 'spell', kind: 'relation', label: 'Sort', target: 'spells', pk: true, required: true, listed: true, filterable: true },
      { name: 'specId', kind: 'integer', label: 'Spec', pk: true, required: true, listed: true, filterable: true, choices: SPEC_CHOICES },
    ],
  },
  {
    key: 'runs',
    entity: ScannedRun,
    table: 'scanned_run',
    label: 'Run',
    labelPlural: 'Runs scannées',
    pk: ['reportCode', 'fightID'],
    defaultSort: { field: 'startedAt', order: 'desc' },
    description: "Pas de table `report` : `reportCode` est une référence d'origine, pas une entité.",
    labelOf: (r) => `${r.reportCode}-${r.fightID}`,
    fields: [
      { name: 'reportCode', kind: 'string', label: 'Report', pk: true, required: true, listed: true, searchable: true, maxLength: 32 },
      { name: 'fightID', kind: 'integer', label: 'Fight', pk: true, required: true, listed: true },
      { name: 'season', kind: 'relation', label: 'Saison', target: 'seasons', required: true, listed: true, filterable: true },
      { name: 'dungeon', kind: 'relation', label: 'Donjon', target: 'dungeons', required: true, listed: true, filterable: true },
      { name: 'dungeonEncounterID', kind: 'integer', label: 'encounterID', required: true, filterable: true, help: 'Saisonnier.' },
      { name: 'keystoneLevel', kind: 'integer', label: 'Niveau', required: true, listed: true, filterable: true },
      { name: 'keystoneTime', kind: 'integer', label: 'Temps clé (ms)', required: true },
      { name: 'keystoneBonus', kind: 'integer', label: 'Chronos', required: true, listed: true, filterable: true, help: '0 = clé non validée.' },
      { name: 'keystoneAffixes', kind: 'int-array', label: 'Affixes' },
      { name: 'kill', kind: 'boolean', label: 'Kill', required: true, listed: true, filterable: true },
      dateField('startedAt', 'Début', { required: true, listed: true, help: "Seul ancrage absolu : report.startTime + fight.startTime." }),
      { name: 'startTime', kind: 'integer', label: 'startTime', required: true },
      { name: 'duration', kind: 'integer', label: 'Durée (ms)', required: true, listed: true },
      { name: 'participants', kind: 'json', label: 'Participants', heavy: true, help: 'Identité des 5 joueurs, figée au scan.' },
      { name: 'spellSetVersion', kind: 'integer', label: 'Version du set', required: true },
      dateField('scannedAt', 'Scanné le', { readonly: true, listed: true }),
    ],
  },
  {
    key: 'scanned-bosses',
    entity: ScannedBoss,
    table: 'scanned_boss',
    label: 'Boss scanné',
    labelPlural: 'Boss scannés',
    pk: ['run', 'orderIndex'],
    defaultSort: { field: 'orderIndex', order: 'asc' },
    description: 'Une fenêtre de boss dans une run, avec ses casts compactés `[ts, sourceID, abilityGameID]`.',
    labelOf: (r) => `#${r.orderIndex}`,
    fields: [
      { name: 'run', kind: 'relation', label: 'Run', target: 'runs', pk: true, required: true, listed: true, filterable: true },
      { name: 'orderIndex', kind: 'integer', label: 'Ordre', pk: true, required: true, listed: true },
      { name: 'pullId', kind: 'integer', label: 'Pull ID', required: true, listed: true, help: "A des trous — ne jamais l'utiliser comme ordre." },
      { name: 'boss', kind: 'relation', label: 'Boss', target: 'bosses', required: true, listed: true, filterable: true },
      { name: 'startTime', kind: 'integer', label: 'startTime', required: true, listed: true },
      { name: 'duration', kind: 'integer', label: 'Durée (ms)', required: true, listed: true },
      { name: 'events', kind: 'json', label: 'Casts', heavy: true, help: 'Seuls les events `cast` sont persistés.' },
    ],
  },
  {
    key: 'scan-jobs',
    entity: ScanJob,
    table: 'scan_job',
    label: 'Job de scan',
    labelPlural: 'Jobs de scan',
    pk: ['id'],
    defaultSort: { field: 'requestedAt', order: 'desc' },
    description: "`id` vaut `${reportCode}-${fightID}` — ':' est interdit par BullMQ.",
    labelOf: (r) => String(r.id),
    fields: [
      { name: 'id', kind: 'string', label: 'ID', pk: true, required: true, listed: true, searchable: true, maxLength: 64 },
      { name: 'status', kind: 'string', label: 'Statut', required: true, listed: true, searchable: true, filterable: true, maxLength: 16 },
      { name: 'error', kind: 'text', label: 'Erreur', searchable: true },
      dateField('requestedAt', 'Demandé le', { listed: true, readonly: true }),
      dateField('completedAt', 'Terminé le', { listed: true }),
    ],
  },
];

const byKey = new Map(RESOURCES.map((r) => [r.key, r]));
export const resourceByKey = (key: string): ResourceDef | undefined => byKey.get(key);
