/**
 * Les 3 requêtes du scan (plan §4.1), plus les lookups de référentiel.
 * `rateLimitData` est injecté par le client — inutile de l'écrire ici.
 */

/** 1/3 — fenêtre de la run + `dungeonPulls` (les boss). ~1 point. */
export const REPORT_FIGHTS = /* GraphQL */ `
  query ReportFights($code: String!) {
    reportData {
      report(code: $code) {
        code
        title
        startTime
        endTime
        zone { id name }
        fights {
          id
          name
          encounterID
          startTime
          endTime
          kill
          keystoneLevel
          keystoneTime
          keystoneBonus
          keystoneAffixes
          friendlyPlayers
          gameZone { id name }
          dungeonPulls { id name encounterID startTime endTime }
        }
      }
    }
  }
`;

/**
 * 2/3 — roster, acteurs et abilities en UN SEUL call : trois champs du même objet.
 * Doit précéder la requête d'events, puisque les specs construisent le filtre. ~1 point.
 */
export const REPORT_ROSTER = /* GraphQL */ `
  query ReportRoster($code: String!, $fightIDs: [Int]) {
    reportData {
      report(code: $code) {
        playerDetails(fightIDs: $fightIDs)
        masterData {
          actors { id gameID name type subType petOwner }
          abilities { gameID name icon type }
        }
      }
    }
  }
`;

/**
 * 3/3 — events.
 *
 * ⚠️ `dataType: All` et non `Casts` : c'est ce qui débloque les casts de boss. Sous `All`,
 * l'argument `hostilityType` est purement ignoré (NOTES E10). Avec `Casts`, on reste borné
 * aux alliés.
 *
 * ⚠️ `limit` toujours au maximum : le coût est ~1 point par page quel que soit son
 * remplissage. Le plafond réel est 10 000, appliqué en silence au-delà (NOTES E3bis).
 */
export const REPORT_EVENTS = /* GraphQL */ `
  query ReportEvents($code: String!, $start: Float!, $end: Float!, $filter: String, $limit: Int!) {
    reportData {
      report(code: $code) {
        events(
          startTime: $start
          endTime: $end
          dataType: All
          limit: $limit
          filterExpression: $filter
          includeResources: false
        ) {
          data
          nextPageTimestamp
        }
      }
    }
  }
`;

/** Talents et spec, par fight. `talents` est mort — lire `talentTree`. */
export const REPORT_COMBATANT_INFO = /* GraphQL */ `
  query ReportCombatantInfo($code: String!, $start: Float!, $end: Float!) {
    reportData {
      report(code: $code) {
        events(startTime: $start, endTime: $end, dataType: CombatantInfo, limit: 100) {
          data
        }
      }
    }
  }
`;

// --- référentiel : hors scan, cachable indéfiniment -----------------------

/** Les 8 donjons d'une saison M+. Leurs `encounterID` sont SAISONNIERS. */
export const WORLD_ZONE = /* GraphQL */ `
  query WorldZone($id: Int!) {
    worldData {
      zone(id: $id) {
        id
        name
        frozen
        expansion { id name }
        encounters { id name }
      }
    }
  }
`;

/** 13 classes, 40 specs. ⚠️ `specs[].id` est un index par classe, pas le specID Blizzard. */
export const GAME_CLASSES = /* GraphQL */ `
  query GameClasses {
    gameData {
      classes { id name slug specs { id name slug } }
    }
  }
`;

/**
 * Lookup global de sorts, par lots d'alias — ~200 par requête pour 1 point.
 * ⚠️ Ne jamais utiliser `gameData.abilities(limit, page)` : 457 369 entrées, 4574 pages.
 */
export function buildAbilityLookup(ids: readonly number[]): string {
  const fields = ids
    .map((id, i) => `    a${i}: gameData { ability(id: ${id}) { id name icon } }`)
    .join('\n');
  return `query AbilityLookup {\n${fields}\n}`;
}

/** Noms canoniques de boss, via le `gameID` des acteurs `subType: "Boss"`. */
export function buildNpcLookup(gameIds: readonly number[]): string {
  const fields = gameIds
    .map((id, i) => `    n${i}: gameData { npc(id: ${id}) { id name } }`)
    .join('\n');
  return `query NpcLookup {\n${fields}\n}`;
}
