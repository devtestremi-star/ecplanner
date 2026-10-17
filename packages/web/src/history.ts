import type { RunDetail } from './api.js';

/**
 * Historique des runs consultées, propre à ce navigateur (`localStorage`).
 *
 * On garde de quoi AFFICHER la ligne sans rien redemander à l'API : identifiants pour
 * rouvrir la page, donjon, niveau et composition. Une entrée déjà présente remonte en tête
 * au lieu d'être dupliquée.
 */
export const HISTORY_MAX = 15;
const STORAGE_KEY = 'ecp.runHistory';

export interface HistoryPlayer {
  name: string;
  role: 'tank' | 'healer' | 'dps' | null;
  color: string | null;
  /** Nom de fichier Blizzard (spec, sinon classe), à passer à `iconUrl`. */
  icon: string | null;
  /** « Holy Paladin », pour l'infobulle. */
  label: string;
}

export interface HistoryEntry {
  reportCode: string;
  fightID: number;
  dungeon: string;
  keystoneLevel: number;
  kill: boolean;
  /** Healer, puis tank, puis dps. */
  players: HistoryPlayer[];
  viewedAt: string;
}

/** Ordre d'affichage de la composition : healer, tank, dps. */
const ROLE_ORDER = { healer: 0, tank: 1, dps: 2 } as const;

const isEntry = (e: unknown): e is HistoryEntry =>
  typeof e === 'object' && e !== null
  && typeof (e as HistoryEntry).reportCode === 'string'
  && typeof (e as HistoryEntry).fightID === 'number'
  && Array.isArray((e as HistoryEntry).players);

/** Stockage absent, plein ou corrompu : l'historique est simplement vide. */
function read(): HistoryEntry[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter(isEntry).slice(0, HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

let cache: HistoryEntry[] = read();
const listeners = new Set<() => void>();

function write(next: HistoryEntry[]): void {
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch { /* historique valable pour cette visite seulement */ }
  for (const fn of listeners) fn();
}

export const historyStore = {
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Même référence tant que rien ne change : exigé par `useSyncExternalStore`. */
  get: (): HistoryEntry[] => cache,
  clear: (): void => write([]),
};

/** Ajoute (ou remonte en tête) la run affichée. */
export function recordRun(detail: RunDetail): void {
  const { run } = detail;
  const players: HistoryPlayer[] = [...detail.participants]
    .sort((a, b) => ROLE_ORDER[a.role ?? 'dps'] - ROLE_ORDER[b.role ?? 'dps'] || a.name.localeCompare(b.name))
    .map((p) => ({
      name: p.name,
      role: p.role,
      color: p.color,
      icon: p.specIcon ?? p.classIcon,
      label: [p.spec, p.class].filter(Boolean).join(' '),
    }));
  const entry: HistoryEntry = {
    reportCode: run.reportCode,
    fightID: run.fightID,
    dungeon: run.dungeon.name,
    keystoneLevel: run.keystoneLevel,
    kill: run.kill,
    players,
    viewedAt: new Date().toISOString(),
  };
  const others = cache.filter((e) => e.reportCode !== entry.reportCode || e.fightID !== entry.fightID);
  write([entry, ...others].slice(0, HISTORY_MAX));
}
