/**
 * Calcul des timers moyens d'un boss à partir de plusieurs combats.
 *
 * Alignement par RANG d'occurrence : la 3e Nether Dash d'un combat est comparée à la 3e
 * des autres. Les timers de boss M+ sont des séquences fixes, c'est donc le bon pivot ;
 * l'écart type signale les rangs où ça ne tient plus (phase déclenchée aux PV, etc.).
 *
 * La couverture se rapporte aux combats ENCORE EN COURS à cet instant, pas à tous : un
 * kill rapide n'a simplement pas vécu la 8e occurrence, ce n'est pas une absence.
 */
export interface TimerSpell {
  spellId: number;
  name: string;
  icon: string | null;
  damageType: string | null;
  allowedInPlan: boolean;
}

export interface TimerPull {
  reportCode: string;
  fightID: number;
  orderIndex: number;
  keystoneLevel: number;
  kill: boolean;
  startedAt: string;
  duration: number;
  outdated: boolean;
  /** `[ms depuis le pull, spellId]`. */
  casts: Array<[number, number]>;
}

export interface TimerData {
  boss: { encounterID: number; name: string; dungeon: string };
  spells: TimerSpell[];
  pulls: TimerPull[];
}

export interface TimerRow {
  spell: TimerSpell;
  /** Rang de l'occurrence, à partir de 1. */
  occurrence: number;
  meanMs: number;
  sdMs: number;
  minMs: number;
  maxMs: number;
  /** Combats où cette occurrence a été vue. */
  seen: number;
  /** Combats encore en cours à l'instant moyen : le dénominateur de la couverture. */
  alive: number;
}

export const pullKey = (p: Pick<TimerPull, 'reportCode' | 'fightID' | 'orderIndex'>): string =>
  `${p.reportCode}-${p.fightID}-${p.orderIndex}`;

export function computeTimers(data: TimerData, pulls: readonly TimerPull[], minCoverage: number): TimerRow[] {
  const rows: TimerRow[] = [];
  for (const spell of data.spells) {
    // Par combat : les instants de ce sort, triés. byRank[k] = instants de la (k+1)e occurrence.
    const byRank: number[][] = [];
    for (const p of pulls) {
      p.casts
        .filter(([, id]) => id === spell.spellId)
        .map(([ms]) => ms)
        .sort((a, b) => a - b)
        .forEach((ms, k) => (byRank[k] ??= []).push(ms));
    }
    byRank.forEach((values, k) => {
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
      const alive = Math.max(values.length, pulls.filter((p) => p.duration >= mean).length);
      if (values.length / alive < minCoverage) return;
      rows.push({
        spell, occurrence: k + 1, meanMs: mean, sdMs: sd,
        minMs: Math.min(...values), maxMs: Math.max(...values), seen: values.length, alive,
      });
    });
  }
  return rows.sort((a, b) => a.meanMs - b.meanMs);
}

export type TimeFormat = 's' | 's1' | 'mmss';

export function formatTime(ms: number, format: TimeFormat): string {
  if (format === 's') return String(Math.round(ms / 1000));
  if (format === 's1') return (ms / 1000).toFixed(1);
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Une ligne par occurrence : `Spell Name - spellId - temps`. */
export const toText = (rows: readonly TimerRow[], format: TimeFormat): string =>
  rows.map((r) => `${r.spell.name} - ${r.spell.spellId} - ${formatTime(r.meanMs, format)}`).join('\n');
