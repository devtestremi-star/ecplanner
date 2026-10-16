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
  .map((s) => ({ value: s.id, label: `${wowClass(s.classId)?.name ?? '?'} - ${s.name}` }))
  .sort((a, b) => a.label.localeCompare(b.label));

export const RESOURCES: readonly ResourceDef[] = [
  {
    key: 'seasons',
    entity: Season,
    table: 'season',
    label: 'Season',
    labelPlural: 'Seasons',
    pk: ['id'],
    defaultSort: { field: 'id', order: 'asc' },
    description: 'One WCL M+ zone per season. `active` drives the default scan.',
    labelOf: (r) => String(r.name ?? r.id),
    fields: [
      { name: 'id', kind: 'integer', label: 'ID', pk: true, generated: true, listed: true },
      { name: 'zoneId', kind: 'integer', label: 'WCL zone', required: true, listed: true, filterable: true, help: '47 = M+ S1, 55 = M+ S2' },
      { name: 'name', kind: 'string', label: 'Name', required: true, listed: true, searchable: true, maxLength: 64 },
      { name: 'expansionId', kind: 'integer', label: 'Expansion', required: true, listed: true, filterable: true },
      { name: 'active', kind: 'boolean', label: 'Active', listed: true, filterable: true },
    ],
  },
  {
    key: 'dungeons',
    entity: Dungeon,
    table: 'dungeon',
    label: 'Dungeon',
    labelPlural: 'Dungeons',
    pk: ['gameZoneId'],
    defaultSort: { field: 'name', order: 'asc' },
    description: "`gameZoneId` is the dungeon's stable identity; the encounterID changes every season.",
    labelOf: (r) => String(r.name ?? r.gameZoneId),
    fields: [
      { name: 'gameZoneId', kind: 'integer', label: 'gameZone ID', pk: true, required: true, listed: true },
      { name: 'slug', kind: 'string', label: 'Slug', required: true, listed: true, searchable: true, maxLength: 64 },
      { name: 'name', kind: 'string', label: 'Name', required: true, listed: true, searchable: true, maxLength: 128 },
    ],
  },
  {
    key: 'dungeon-seasons',
    entity: DungeonSeason,
    table: 'dungeon_season',
    label: 'Dungeon × Season',
    labelPlural: 'Dungeons × Seasons',
    pivot: true,
    pk: ['dungeon', 'season'],
    defaultSort: { field: 'encounterID', order: 'asc' },
    description: "A dungeon's seasonal encounterID.",
    labelOf: (r) => `#${r.encounterID}`,
    fields: [
      { name: 'dungeon', kind: 'relation', label: 'Dungeon', target: 'dungeons', pk: true, required: true, listed: true, filterable: true },
      { name: 'season', kind: 'relation', label: 'Season', target: 'seasons', pk: true, required: true, listed: true, filterable: true },
      { name: 'encounterID', kind: 'integer', label: 'encounterID', required: true, listed: true, filterable: true },
    ],
  },
  {
    key: 'bosses',
    entity: Boss,
    table: 'boss',
    label: 'Boss',
    labelPlural: 'Bosses',
    pk: ['encounterID'],
    defaultSort: { field: 'name', order: 'asc' },
    description: "`encounterID` comes from `dungeonPull`; `npcGameId` is the durable link to gameData.",
    labelOf: (r) => String(r.name ?? r.encounterID),
    fields: [
      { name: 'encounterID', kind: 'integer', label: 'encounterID', pk: true, required: true, listed: true },
      { name: 'npcGameId', kind: 'integer', label: 'NPC gameID', listed: true, filterable: true },
      { name: 'dungeon', kind: 'relation', label: 'Dungeon', target: 'dungeons', required: true, listed: true, filterable: true },
      { name: 'slug', kind: 'string', label: 'Slug', required: true, listed: true, searchable: true, maxLength: 64 },
      { name: 'name', kind: 'string', label: 'Name', required: true, listed: true, searchable: true, maxLength: 128 },
    ],
  },
  {
    key: 'spells',
    entity: Spell,
    table: 'spell',
    label: 'Spell',
    labelPlural: 'Spells',
    pk: ['spellId'],
    defaultSort: { field: 'name', order: 'asc' },
    description: 'No spec and no boss ⇒ cross-class spell, always included in the scan.',
    labelOf: (r) => String(r.name ?? r.spellId),
    fields: [
      { name: 'spellId', kind: 'integer', label: 'Spell ID', pk: true, required: true, listed: true },
      { name: 'name', kind: 'string', label: 'Name', required: true, listed: true, searchable: true, maxLength: 128 },
      { name: 'icon', kind: 'string', label: 'Icon', searchable: true, maxLength: 128, help: 'Blizzard file name, never a URL.' },
      { name: 'category', kind: 'enum', label: 'Category', listed: true, filterable: true, enumValues: Object.values(SpellCategory) },
      { name: 'baseCooldownSec', kind: 'integer', label: 'Base CD (s)', help: 'DB2 SpellCooldowns - ignores talents and haste.' },
      { name: 'cooldownSec', kind: 'integer', label: 'Measured CD (s)', listed: true, help: 'Minimum gap between two casts, measured on the corpus.' },
      { name: 'cooldownSamples', kind: 'integer', label: 'Samples', listed: true },
      dateField('cooldownMeasuredAt', 'Measured on'),
      { name: 'boss', kind: 'relation', label: 'Boss', target: 'bosses', listed: true, filterable: true, help: 'Set ⇔ boss ability.' },
      {
        name: 'filterType', kind: 'string', label: 'Event type', listed: true, filterable: true, maxLength: 24,
        help: 'Empty = `cast`, the vast majority. `applybuff` for cooldowns that activate without being cast - declare per spell, never infer.',
      },
    ],
  },
  {
    key: 'spell-specs',
    entity: SpellSpec,
    table: 'spell_spec',
    label: 'Spell × Spec',
    labelPlural: 'Spells × Specs',
    pivot: true,
    pk: ['spell', 'specId'],
    defaultSort: { field: 'specId', order: 'asc' },
    description: '`specId` is a raw Blizzard specID - the spec reference data lives in constants.',
    labelOf: (r) => {
      const spec = wowSpec(Number(r.specId));
      return spec ? `${wowClass(spec.classId)?.name ?? '?'} - ${spec.name}` : `spec ${r.specId}`;
    },
    fields: [
      { name: 'spell', kind: 'relation', label: 'Spell', target: 'spells', pk: true, required: true, listed: true, filterable: true },
      { name: 'specId', kind: 'integer', label: 'Spec', pk: true, required: true, listed: true, filterable: true, choices: SPEC_CHOICES },
    ],
  },
  {
    key: 'runs',
    entity: ScannedRun,
    table: 'scanned_run',
    label: 'Run',
    labelPlural: 'Scanned runs',
    pk: ['reportCode', 'fightID'],
    defaultSort: { field: 'startedAt', order: 'desc' },
    description: 'No `report` table: `reportCode` is a source reference, not an entity.',
    labelOf: (r) => `${r.reportCode}-${r.fightID}`,
    fields: [
      { name: 'reportCode', kind: 'string', label: 'Report', pk: true, required: true, listed: true, searchable: true, maxLength: 32 },
      { name: 'fightID', kind: 'integer', label: 'Fight', pk: true, required: true, listed: true },
      { name: 'season', kind: 'relation', label: 'Season', target: 'seasons', required: true, listed: true, filterable: true },
      { name: 'dungeon', kind: 'relation', label: 'Dungeon', target: 'dungeons', required: true, listed: true, filterable: true },
      { name: 'dungeonEncounterID', kind: 'integer', label: 'encounterID', required: true, filterable: true, help: 'Seasonal.' },
      { name: 'keystoneLevel', kind: 'integer', label: 'Level', required: true, listed: true, filterable: true },
      { name: 'keystoneTime', kind: 'integer', label: 'Key timer (ms)', required: true },
      { name: 'keystoneBonus', kind: 'integer', label: 'Upgrades', required: true, listed: true, filterable: true, help: '0 = key not timed.' },
      { name: 'keystoneAffixes', kind: 'int-array', label: 'Affixes' },
      { name: 'kill', kind: 'boolean', label: 'Kill', required: true, listed: true, filterable: true },
      dateField('startedAt', 'Started', { required: true, listed: true, help: 'Only absolute anchor: report.startTime + fight.startTime.' }),
      { name: 'startTime', kind: 'integer', label: 'startTime', required: true },
      { name: 'duration', kind: 'integer', label: 'Duration (ms)', required: true, listed: true },
      { name: 'participants', kind: 'json', label: 'Participants', heavy: true, help: 'Identity of the 5 players, frozen at scan time.' },
      { name: 'spellSetVersion', kind: 'integer', label: 'Spell set version', required: true },
      dateField('scannedAt', 'Scanned on', { readonly: true, listed: true }),
    ],
  },
  {
    key: 'scanned-bosses',
    entity: ScannedBoss,
    table: 'scanned_boss',
    label: 'Scanned boss',
    labelPlural: 'Scanned bosses',
    pk: ['run', 'orderIndex'],
    defaultSort: { field: 'orderIndex', order: 'asc' },
    description: 'A boss window within a run, with its compacted casts `[ts, sourceID, abilityGameID]`.',
    labelOf: (r) => `#${r.orderIndex}`,
    fields: [
      { name: 'run', kind: 'relation', label: 'Run', target: 'runs', pk: true, required: true, listed: true, filterable: true },
      { name: 'orderIndex', kind: 'integer', label: 'Order', pk: true, required: true, listed: true },
      { name: 'pullId', kind: 'integer', label: 'Pull ID', required: true, listed: true, help: 'Has gaps - never use it as an order.' },
      { name: 'boss', kind: 'relation', label: 'Boss', target: 'bosses', required: true, listed: true, filterable: true },
      { name: 'startTime', kind: 'integer', label: 'startTime', required: true, listed: true },
      { name: 'duration', kind: 'integer', label: 'Duration (ms)', required: true, listed: true },
      { name: 'events', kind: 'json', label: 'Casts', heavy: true, help: 'Only `cast` events are stored.' },
    ],
  },
  {
    key: 'scan-jobs',
    entity: ScanJob,
    table: 'scan_job',
    label: 'Scan job',
    labelPlural: 'Scan jobs',
    pk: ['id'],
    defaultSort: { field: 'requestedAt', order: 'desc' },
    description: "`id` is `${reportCode}-${fightID}` - ':' is forbidden by BullMQ.",
    labelOf: (r) => String(r.id),
    fields: [
      { name: 'id', kind: 'string', label: 'ID', pk: true, required: true, listed: true, searchable: true, maxLength: 64 },
      { name: 'status', kind: 'string', label: 'Status', required: true, listed: true, searchable: true, filterable: true, maxLength: 16 },
      { name: 'error', kind: 'text', label: 'Error', searchable: true },
      dateField('requestedAt', 'Requested on', { listed: true, readonly: true }),
      dateField('completedAt', 'Completed on', { listed: true }),
    ],
  },
];

const byKey = new Map(RESOURCES.map((r) => [r.key, r]));
export const resourceByKey = (key: string): ResourceDef | undefined => byKey.get(key);
