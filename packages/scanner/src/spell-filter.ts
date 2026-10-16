import type { EntityManager } from '@mikro-orm/postgresql';
import { buildAbilityFilter, filterCost, FILTER_BUDGET } from '@timeline/wcl';

export interface SpellFilter {
  ids: number[];
  expression: string;
  cost: number;
  /** spellId → type d'event attendu, pour les sorts qui ne passent pas par `cast`. */
  filterTypeById: Map<number, string>;
  /**
   * Identifiant du log → identifiant curé (celui de l'addon), pour les sorts que le log
   * enregistre sous un autre id. Voir `SpellAlias`.
   */
  aliasOf: Map<number, number>;
}

/**
 * Construit la liste de sorts à filtrer, restreinte aux specs présentes dans la run.
 *
 * Trois familles (plan §5.2), sans discriminant explicite — l'appartenance se lit dans
 * les relations :
 *   - un sort avec `boss_encounter_id` : sort de boss, toujours inclus
 *   - un sort sans aucune ligne `spell_spec` : inter-classes, toujours inclus
 *   - les autres : uniquement si rattachés à une spec présente
 *
 * Le préfiltre n'est pas une optimisation : sans lui, la liste complète dépasserait le
 * budget et l'API renverrait `events: null` en HTTP 200, sans erreur (NOTES E8/E11).
 */
export async function buildSpellFilter(em: EntityManager, specIds: number[]): Promise<SpellFilter> {
  const rows = await em.getConnection().execute<Array<{ spell_id: number; filter_type: string | null }>>(
    `select s.spell_id, s.filter_type from spell s
     where (
          s.boss_encounter_id is not null
       or not exists (select 1 from spell_spec x where x.spell_id = s.spell_id)
       or exists (select 1 from spell_spec ss
                  where ss.spell_id = s.spell_id and ss.spec_id in (?))
     )
     order by s.spell_id`,
    [specIds.length ? specIds : [-1]],
  );

  const ids = rows.map((r) => r.spell_id);
  const filterTypeById = new Map(
    rows.filter((r) => r.filter_type).map((r) => [r.spell_id, r.filter_type as string]),
  );

  // Les alias des sorts retenus entrent dans le filtre : c'est sous CET id que le log
  // enregistre le cast, l'identifiant curé n'y apparaît jamais.
  const aliasRows = ids.length
    ? await em.getConnection().execute<Array<{ alias_id: number; spell_id: number }>>(
        'select alias_id, spell_id from spell_alias where spell_id in (?)',
        [ids],
      )
    : [];
  const aliasOf = new Map(aliasRows.map((a) => [a.alias_id, a.spell_id]));
  const requested = [...ids, ...aliasOf.keys()];

  // buildAbilityFilter lève FilterTooLargeError avant tout appel réseau.
  const expression = buildAbilityFilter(requested);
  return { ids: requested, expression, cost: filterCost(requested), filterTypeById, aliasOf };
}

export { FILTER_BUDGET };
