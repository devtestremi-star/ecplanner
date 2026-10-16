import type { SpellSummary } from '../spells/catalog.js';
import type { RunDetail } from '../api.js';

export const CATEGORIES = [
  'OFFENSIVE',
  'PERSONAL',
  'EXTERNAL',
  'HEALER',
  'BLOODLUST',
  'UTILITY',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  OFFENSIVE: 'Offensifs',
  PERSONAL: 'Personnels',
  EXTERNAL: 'Externes',
  HEALER: 'Soins',
  BLOODLUST: 'Bloodlust',
  UTILITY: 'Utilitaires',
};

export const CATEGORY_COLOR: Record<Category, string> = {
  OFFENSIVE: '#f85149',
  PERSONAL: '#4a9eff',
  EXTERNAL: '#d29922',
  HEALER: '#3fb950',
  BLOODLUST: '#c678dd',
  UTILITY: '#8b93a3',
};

/**
 * La catégorie dépend de la SPEC DU LANCEUR : Divine Toll soigne en Holy et frappe
 * ailleurs, Lay on Hands est un soin d'urgence en Holy mais un défensif personnel en
 * Protection. Le catalogue porte la requalification dans `bySpec`.
 *
 * Un sort sans catégorie ou hors nomenclature retombe sur UTILITY plutôt que d'être
 * masqué : mieux vaut mal classer que faire disparaître un cast réel.
 */
export function categoryOf(spell: SpellSummary | undefined, casterSpecId?: number): Category {
  const raw = (casterSpecId != null ? spell?.bySpec?.[casterSpecId] : undefined) ?? spell?.category;
  return (CATEGORIES as readonly string[]).includes(raw ?? '') ? (raw as Category) : 'UTILITY';
}

/** Compte les casts par catégorie sur les boss affichés, pour étiqueter les filtres. */
export function countByCategory(
  bosses: RunDetail['bosses'],
  catalog: Map<number, SpellSummary>,
  specBySource: Map<number, number>,
): Record<Category, number> {
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const b of bosses) {
    for (const c of b.casts) {
      counts[categoryOf(catalog.get(c.abilityGameID), specBySource.get(c.sourceID))]++;
    }
  }
  return counts;
}

/** `?cat=PERSONAL,HEALER` — absent ou vide = tout afficher. */
export function parseCategories(raw: string | null): Set<Category> {
  if (!raw) return new Set(CATEGORIES);
  const wanted = raw.split(',').map((s) => s.trim().toUpperCase());
  const valid = CATEGORIES.filter((c) => wanted.includes(c));
  return new Set(valid.length ? valid : CATEGORIES);
}
