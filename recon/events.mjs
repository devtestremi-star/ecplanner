// Pagination des events avec les garde-fous du §4.4.
// « Le garde-fou n'est pas optionnel. Une boucle qui s'emballe vide 3 600 points
//   en quelques secondes — c'est le mode d'échec le plus coûteux du système. »

import { gql, logRate } from './wcl.mjs';

const MAX_PAGES = 20; // plafond de recon, volontairement bas

const QUERY = `query ($code: String!, $start: Float!, $end: Float!, $limit: Int, $filter: String) {
  reportData {
    report(code: $code) {
      events(
        startTime: $start
        endTime: $end
        dataType: Casts
        hostilityType: Friendlies
        limit: $limit
        filterExpression: $filter
        includeResources: false
      ) {
        data
        nextPageTimestamp
      }
    }
  }
}`;

export async function fetchAllEvents({ reportCode, startTime, endTime, filter = null, limit = 10000, label = 'events' }) {
  const all = [];
  let cursor = startTime;
  let pages = 0;
  let totalCost = 0;

  while (true) {
    const { data, rate, cost } = await gql(QUERY, {
      code: reportCode,
      start: cursor,
      end: endTime,
      limit,
      filter,
    });
    pages++;
    if (cost !== null) totalCost += cost;
    logRate(`${label} p${pages}`, rate, cost);

    const page = data.reportData.report.events;
    all.push(...page.data);

    // Garde-fou rate limit (§4.5) : on pilote sur le solde réel, pas sur une estimation.
    if (rate && rate.pointsSpentThisHour / rate.limitPerHour > 0.8) {
      throw new Error(
        `Budget à ${((rate.pointsSpentThisHour / rate.limitPerHour) * 100).toFixed(0)}% — arrêt de la recon. Reset dans ${rate.pointsResetIn}s.`
      );
    }

    if (page.nextPageTimestamp == null) break;
    if (page.nextPageTimestamp <= cursor) {
      throw new Error(`Curseur non progressif: ${reportCode} @ ${cursor} → ${page.nextPageTimestamp}`);
    }
    if (pages >= MAX_PAGES) {
      throw new Error(`Pagination runaway: ${reportCode}, ${pages} pages`);
    }
    cursor = page.nextPageTimestamp;
  }

  return { events: all, pages, cost: totalCost };
}
