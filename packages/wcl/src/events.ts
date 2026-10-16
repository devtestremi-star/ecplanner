import type { WclClient } from './client.js';
import { PaginationError, WclNullResultError } from './errors.js';
import { REPORT_EVENTS } from './queries.js';
import { EventPageSchema, type WclEvent } from './schemas.js';

/** Plafond réel, appliqué en silence par l'API au-delà (NOTES E3bis). */
export const EVENTS_PAGE_LIMIT = 10_000;

/**
 * Plafond de pages. Une run de 30 min filtrée tient en 1 page ; sans filtre, 2.
 * Ce garde-fou n'est pas optionnel : une boucle qui s'emballe est le pire usage
 * possible des points (plan §4.4).
 */
const MAX_PAGES = 20;

export interface FetchEventsOptions {
  reportCode: string;
  startTime: number;
  endTime: number;
  /** Expression construite par `buildAbilityFilter`, ou null pour tout ramener. */
  filter?: string | null;
  onPage?: (info: { page: number; count: number; cost: number | null }) => void;
}

export interface FetchEventsResult {
  events: WclEvent[];
  pages: number;
  totalCost: number;
}

export async function fetchAllEvents(
  client: WclClient,
  opts: FetchEventsOptions,
): Promise<FetchEventsResult> {
  const events: WclEvent[] = [];
  let cursor = opts.startTime;
  let pages = 0;
  let totalCost = 0;

  for (;;) {
    const res = await client.query<{
      reportData: { report: { events: unknown } | null };
    }>(REPORT_EVENTS, {
      code: opts.reportCode,
      start: cursor,
      end: opts.endTime,
      filter: opts.filter ?? null,
      limit: EVENTS_PAGE_LIMIT,
    });

    const raw = res.data.reportData.report?.events;
    // ☠️ null en HTTP 200 sans erreur GraphQL : filtre au-delà du budget.
    // Ne surtout pas confondre avec « aucun event ».
    if (raw == null) throw new WclNullResultError('reportData.report.events');

    const page = EventPageSchema.parse(raw);
    pages++;
    if (res.cost !== null) totalCost += res.cost;
    events.push(...page.data);
    opts.onPage?.({ page: pages, count: page.data.length, cost: res.cost });

    if (page.nextPageTimestamp == null) break;
    if (page.nextPageTimestamp <= cursor) {
      throw new PaginationError(
        `Curseur non progressif : ${opts.reportCode} @ ${cursor} → ${page.nextPageTimestamp}`,
      );
    }
    if (pages >= MAX_PAGES) {
      throw new PaginationError(`Pagination emballée : ${opts.reportCode}, ${pages} pages`);
    }
    cursor = page.nextPageTimestamp;
  }

  return { events, pages, totalCost };
}
