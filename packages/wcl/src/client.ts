import { CLIENT_ENDPOINT, TokenProvider, type WclCredentials } from './auth.js';
import { RateLimitError, WclGraphQLError, WclHttpError } from './errors.js';

export interface RateLimitData {
  limitPerHour: number;
  pointsSpentThisHour: number;
  pointsResetIn: number;
}

export interface GqlResult<T> {
  data: T;
  rate: RateLimitData | null;
  /** Delta de `pointsSpentThisHour` depuis la requête précédente. Seule mesure fiable. */
  cost: number | null;
}

export interface WclClientOptions {
  credentials: WclCredentials;
  endpoint?: string;
  /** Fraction du budget au-delà de laquelle on lève RateLimitError. Plan §4.5. */
  rateLimitThreshold?: number;
  onRateLimit?: (rate: RateLimitData) => void;
}

const RATE_LIMIT_FRAGMENT = 'rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn }';

/**
 * Injecte `rateLimitData` dans TOUTE query. Le plan (§4.4) impose de le lire à chaque
 * page, pas une fois par job — le faire ici rend l'oubli structurellement impossible.
 */
function injectRateLimit(query: string): string {
  if (query.includes('rateLimitData')) return query;
  const close = query.lastIndexOf('}');
  if (close === -1) throw new Error('Query GraphQL illisible');
  return `${query.slice(0, close)}\n  ${RATE_LIMIT_FRAGMENT}\n${query.slice(close)}`;
}

export class WclClient {
  readonly #tokens: TokenProvider;
  readonly #endpoint: string;
  readonly #threshold: number;
  readonly #onRateLimit: ((rate: RateLimitData) => void) | undefined;
  #lastPointsSpent: number | null = null;

  constructor(opts: WclClientOptions) {
    this.#tokens = new TokenProvider(opts.credentials);
    this.#endpoint = opts.endpoint ?? CLIENT_ENDPOINT;
    this.#threshold = opts.rateLimitThreshold ?? 0.8;
    this.#onRateLimit = opts.onRateLimit;
  }

  /** Dernier solde observé, pour journalisation. */
  get lastPointsSpent(): number | null {
    return this.#lastPointsSpent;
  }

  async query<T>(query: string, variables: Record<string, unknown> = {}): Promise<GqlResult<T>> {
    const body = JSON.stringify({ query: injectRateLimit(query), variables });

    let res = await this.#post(body);
    // Un 401 signifie presque toujours un token périmé côté serveur : on réessaie une fois.
    if (res.status === 401) {
      this.#tokens.invalidate();
      res = await this.#post(body);
    }

    const text = await res.text();
    let json: { data?: T & { rateLimitData?: RateLimitData }; errors?: unknown };
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      throw new WclHttpError(res.status, text);
    }

    // Les erreurs GraphQL arrivent en HTTP 200 : les tester AVANT le statut.
    if (json.errors) throw new WclGraphQLError(json.errors);
    if (!res.ok) throw new WclHttpError(res.status, text);
    if (!json.data) throw new WclGraphQLError(null, 'Réponse sans `data`');

    const rate = json.data.rateLimitData ?? null;
    const cost = rate && this.#lastPointsSpent !== null
      ? rate.pointsSpentThisHour - this.#lastPointsSpent
      : null;
    if (rate) this.#lastPointsSpent = rate.pointsSpentThisHour;

    if (rate && rate.pointsSpentThisHour / rate.limitPerHour > this.#threshold) {
      this.#onRateLimit?.(rate);
      throw new RateLimitError(rate.pointsResetIn, rate.pointsSpentThisHour, rate.limitPerHour);
    }

    return { data: json.data, rate, cost };
  }

  async #post(body: string): Promise<Response> {
    const token = await this.#tokens.get();
    return fetch(this.#endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body,
    });
  }
}
