import i18n from '../i18n/index.js';
import type { ListResult, Option, ResourceSchema, Row, Stat } from './types.js';
import type { TimerData } from './tools/timers.js';

const BASE = '/api/admin';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * La session vit dans un cookie `HttpOnly` posé par l'API : le navigateur l'envoie seul
 * (même origine), le code n'y touche jamais.
 */
function send(path: string, init?: RequestInit): Promise<Response> {
  const headers: Record<string, string> = {};
  if (init?.body) headers['Content-Type'] = 'application/json';
  return fetch(`${BASE}${path}`, { ...init, headers });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await send(path, init);
  // Session expirée en cours de route : la coque de l'admin réaffiche la connexion.
  if (res.status === 401) for (const fn of unauthorizedListeners) fn();

  if (!res.ok) {
    // Nest renvoie `{ message }` — c'est le texte que l'admin doit montrer, pas un code HTTP nu.
    const body = await res.json().catch(() => null);
    const message = typeof body?.message === 'string'
      ? body.message
      : Array.isArray(body?.message) ? body.message.join(', ') : i18n.t('admin.httpError', { status: res.status });
    throw new ApiError(message, res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const unauthorizedListeners = new Set<() => void>();
export const onUnauthorized = (fn: () => void): (() => void) => {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
};

export interface SessionStatus {
  /** `open` : local sans mot de passe. `password` : connexion exigée. */
  mode: 'open' | 'password';
  authenticated: boolean;
}

export const session = {
  status: () => request<SessionStatus>('/session'),
  login: (password: string) => request<void>('/session', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request<void>('/session', { method: 'DELETE' }),
};

/** Le schéma ne change pas d'un rendu à l'autre : une seule requête pour toute la session. */
let schemaPromise: Promise<ResourceSchema[]> | null = null;

export const api = {
  schema(): Promise<ResourceSchema[]> {
    schemaPromise ??= request<{ resources: ResourceSchema[] }>('/schema').then((r) => r.resources);
    return schemaPromise;
  },

  stats: () => request<Stat[]>('/stats'),

  /** Boss ayant au moins un combat scanné, pour l'extraction de timers. */
  timerBosses: () =>
    request<Array<{ encounterID: number; name: string; dungeon: string; pulls: number; runs: number }>>('/tools/timers'),
  timers: (encounterID: number) => request<TimerData>(`/tools/timers/${encounterID}`),

  list(resource: string, params: Record<string, string | number | undefined>): Promise<ListResult> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
    return request<ListResult>(`/${resource}?${qs}`);
  },

  get: (resource: string, id: string) =>
    request<{ row: Row; refs: Record<string, Record<string, string>> }>(`/${resource}/${encodeURIComponent(id)}`),

  create: (resource: string, body: unknown) =>
    request<Row>(`/${resource}`, { method: 'POST', body: JSON.stringify(body) }),

  update: (resource: string, id: string, body: unknown) =>
    request<Row>(`/${resource}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),

  remove: (resource: string, id: string) =>
    request<{ deleted: string }>(`/${resource}/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  options: (resource: string, q = '') =>
    request<Option[]>(`/${resource}/options?q=${encodeURIComponent(q)}`),
};
