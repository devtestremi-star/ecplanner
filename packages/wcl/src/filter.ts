import { FilterTooLargeError } from './errors.js';

/**
 * Budget d'une `filterExpression` de la forme `ability.id in (…)`.
 *
 * Mesuré par dichotomie sur 5 longueurs d'id, erreur ≤ 0,6 % (NOTES E11) :
 *   Σ (chiffres(id) + 4,23) ≲ 7215
 *
 * Au-delà, l'API renvoie `events: null` en HTTP 200 **sans erreur GraphQL**. Aucun autre
 * signal. Le garde-fou n'est donc pas une optimisation, c'est la seule protection.
 */
export const FILTER_BUDGET_MEASURED = 7215;
export const FILTER_BUDGET = 6500; // marge de 10 %
const PER_ID_OVERHEAD = 4.23;

export const filterCost = (ids: readonly number[]): number =>
  ids.reduce((sum, id) => sum + String(id).length + PER_ID_OVERHEAD, 0);

export const fitsFilter = (ids: readonly number[]): boolean => filterCost(ids) <= FILTER_BUDGET;

/** Capacité restante, en nombre d'ids d'une longueur donnée. */
export const remainingCapacity = (ids: readonly number[], digits = 7): number =>
  Math.max(0, Math.floor((FILTER_BUDGET - filterCost(ids)) / (digits + PER_ID_OVERHEAD)));

/**
 * Construit l'expression, ou lève AVANT tout appel réseau.
 *
 * ⚠️ `ability.id` et non `abilityGameID` : ce dernier est un nom de champ invalide côté
 * filtre et renvoie **0 event sans erreur** (NOTES E5).
 *
 * ⚠️ Pas de `type = "cast"` : à coût identique, il supprime des `death` et `aurabroken`
 * porteurs de signal sur les mêmes sorts. Le tri des types se fait en post-traitement (§5.6).
 */
export function buildAbilityFilter(ids: readonly number[]): string {
  if (ids.length === 0) throw new Error('Liste de sorts vide — le filtre serait sans effet');
  const cost = filterCost(ids);
  if (cost > FILTER_BUDGET) throw new FilterTooLargeError(ids.length, cost, FILTER_BUDGET);
  return `ability.id in (${ids.join(', ')})`;
}

/** Découpe une liste trop longue en lots tenant chacun dans le budget. */
export function chunkByBudget(ids: readonly number[]): number[][] {
  const chunks: number[][] = [];
  let current: number[] = [];
  let cost = 0;
  for (const id of ids) {
    const c = String(id).length + PER_ID_OVERHEAD;
    if (cost + c > FILTER_BUDGET && current.length > 0) {
      chunks.push(current);
      current = [];
      cost = 0;
    }
    current.push(id);
    cost += c;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
