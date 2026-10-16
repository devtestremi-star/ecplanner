export const TOKEN_ENDPOINT = 'https://www.warcraftlogs.com/oauth/token';
export const CLIENT_ENDPOINT = 'https://www.warcraftlogs.com/api/v2/client';

export interface WclCredentials {
  clientId: string;
  clientSecret: string;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

/**
 * OAuth client credentials. Les rapports privés sont hors périmètre (plan §4.6),
 * donc pas de flow authorization code — mais l'endpoint reste paramétrable pour ne
 * pas fermer la porte.
 */
export class TokenProvider {
  #cached: CachedToken | null = null;
  #inFlight: Promise<string> | null = null;

  constructor(
    private readonly creds: WclCredentials,
    private readonly endpoint: string = TOKEN_ENDPOINT,
  ) {}

  /** Renouvelle 60 s avant l'expiration. Les appels concurrents partagent la requête. */
  async get(): Promise<string> {
    if (this.#cached && this.#cached.expiresAt > Date.now() + 60_000) {
      return this.#cached.value;
    }
    this.#inFlight ??= this.#fetch().finally(() => {
      this.#inFlight = null;
    });
    return this.#inFlight;
  }

  /** Force le renouvellement — à appeler sur un 401. */
  invalidate(): void {
    this.#cached = null;
  }

  async #fetch(): Promise<string> {
    const basic = Buffer.from(`${this.creds.clientId}:${this.creds.clientSecret}`).toString('base64');
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });

    if (!res.ok) {
      throw new WclAuthError(`OAuth ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.#cached = {
      value: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
    return json.access_token;
  }
}

export class WclAuthError extends Error {
  override readonly name = 'WclAuthError';
}
