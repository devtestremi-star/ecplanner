/**
 * Fusion des occurrences rapprochées d'une même capacité de boss.
 *
 * Plusieurs sources lancent souvent la même capacité presque en même temps : les Ethereal
 * Shades de Taz'rah rendent 3 à 4 Nether Dash en 2 s, Taz'rah et une Shade rendent deux
 * Umbral Rupture à la même milliseconde. Pour l'addon c'est UNE occurrence ; garder les
 * doublons encombrait la piste du boss et décalait la numérotation des occurrences de
 * l'export ECP.
 *
 * Appliqué à la LECTURE, avant l'affichage, l'alignement et l'export : les trois voient
 * la même liste, et les runs déjà scannées en profitent sans rescan.
 */
export const BOSS_DUPLICATE_WINDOW_MS = 5_000;

type StoredEvent = readonly [number, number, number, string];

/**
 * Écarte, pour une même capacité de boss, toute occurrence à moins de
 * `BOSS_DUPLICATE_WINDOW_MS` de la précédente CONSERVÉE, quelle que soit sa source.
 * Comparer à la précédente conservée et non à la précédente vue : une capacité qui revient
 * toutes les 4 s n'est pas avalée de proche en proche. Les casts des joueurs passent tels
 * quels.
 */
export function dedupBossEvents<E extends StoredEvent>(events: readonly E[], playerIds: ReadonlySet<number>): E[] {
  const lastKept = new Map<number, number>();
  return [...events]
    .sort((a, b) => a[0] - b[0])
    .filter(([ts, src, ability]) => {
      if (playerIds.has(src)) return true;
      const prev = lastKept.get(ability);
      if (prev !== undefined && ts - prev < BOSS_DUPLICATE_WINDOW_MS) return false;
      lastKept.set(ability, ts);
      return true;
    });
}
