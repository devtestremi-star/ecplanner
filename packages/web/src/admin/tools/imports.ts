/** Miroir des réponses de `/api/admin/tools/imports` (`ImportsService` côté API). */

export interface ImportDungeon { gameZoneId: number; name: string; encounterID: number }
export interface HealerSpec { id: number; name: string; className: string; color: string | null; icon: string }
export interface ImportOptions { dungeons: ImportDungeon[]; healerSpecs: HealerSpec[] }

export interface ImportBatch {
  id: number;
  name: string | null;
  characterName: string;
  serverSlug: string;
  serverRegion: string;
  healerSpecId: number | null;
  minLevel: number;
  dungeons: number[];
  createdAt: string;
  season: string;
}

export interface ImportBatchSummary extends ImportBatch {
  total: number;
  imported: number;
}

export interface ImportCandidate {
  id: number;
  reportCode: string;
  fightID: number;
  gameZoneId: number;
  dungeon: string;
  keystoneLevel: number;
  /** `gold` / `silver` / `bronze`, ou `none` pour une clé ratée. */
  medal: string;
  spec: string | null;
  startedAt: string;
  duration: number;
  lastError: string | null;
  /** Calculé par jointure sur `scanned_run` : jamais stocké. */
  imported: boolean;
}

export const characterLabel = (b: Pick<ImportBatch, 'characterName' | 'serverSlug' | 'serverRegion'>): string =>
  `${b.characterName}-${b.serverSlug}-${b.serverRegion}`;

export const batchLabel = (b: ImportBatch): string => b.name || characterLabel(b);
