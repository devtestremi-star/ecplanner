/**
 * Décalage vertical des icônes lancées quasi simultanément.
 *
 * Le chevauchement partiel ne gêne pas : deux casts à quelques secondes d'écart restent
 * lisibles l'un derrière l'autre. Le cas à traiter est celui où l'icône du dessus masque
 * ENTIÈREMENT celle du dessous — typiquement deux sorts dans la même macro (Armée des
 * morts + Transformation noire), séparés de moins de 100 ms dans le log.
 *
 * Le critère est donc visuel, pas temporel : on décale quand la séparation à l'écran
 * descend sous quelques pixels. L'exprimer ainsi le rend indépendant de l'échelle —
 * changer `PX_PER_SEC` ajuste le seuil tout seul.
 *
 * L'icône ne bouge JAMAIS horizontalement : sa position porte l'information.
 */

/** Fenêtre temporelle correspondant à une séparation visible donnée, à l'échelle courante. */
export const minSeparationMs = (px: number, pxPerSec: number): number => (px / pxPerSec) * 1000;

export interface Placed<T> {
  item: T;
  /** 0 = rangée du bas, position d'origine. Chaque rangée suivante monte d'un cran. */
  row: number;
}

export interface PackedLane<T> {
  placed: Placed<T>[];
  /** Rangées occupées — 1 quand rien n'est simultané, soit le cas courant. */
  rowCount: number;
}

/**
 * Placement glouton « première rangée libre », par ordre chronologique : le plus ancien
 * garde la rangée du bas, celui qui le masquerait monte d'un cran.
 *
 * Dès que l'écart repasse au-dessus du seuil, on redescend — une piste chargée ne doit
 * pas monter indéfiniment.
 */
export function packLane<T>(
  items: readonly T[],
  timeOf: (item: T) => number,
  windowMs: number,
): PackedLane<T> {
  const sorted = [...items].sort((a, b) => timeOf(a) - timeOf(b));
  /** Instant du dernier élément posé sur chaque rangée. */
  const lastOnRow: number[] = [];
  const placed: Placed<T>[] = [];

  for (const item of sorted) {
    const t = timeOf(item);
    let row = lastOnRow.findIndex((last) => t - last >= windowMs);
    if (row === -1) {
      row = lastOnRow.length;
      lastOnRow.push(t);
    } else {
      lastOnRow[row] = t;
    }
    placed.push({ item, row });
  }

  return { placed, rowCount: Math.max(1, lastOnRow.length) };
}
