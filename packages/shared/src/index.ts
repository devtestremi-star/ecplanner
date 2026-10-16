export * from './wow.js';

export const SPELL_FILTER_BUDGET = 6500;

/** Coût d'une filterExpression `ability.id in (…)`. Mesuré : Σ(chiffres+4,23) ≲ 7215. */
export const filterCost = (ids: readonly number[]): number =>
  ids.reduce((s, id) => s + String(id).length + 4.23, 0);

export const fitsFilter = (ids: readonly number[]): boolean =>
  filterCost(ids) <= SPELL_FILTER_BUDGET;
