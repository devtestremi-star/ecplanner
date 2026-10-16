import i18n from '../i18n/index.js';
import type { ListResult, Option, ResourceSchema, Row, Stat } from './types.js';

const BASE = '/api/admin';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Jeton `ADMIN_TOKEN` de l'API, demandé au premier refus puis gardé dans ce navigateur.
 * En local sans `ADMIN_TOKEN`, l'API laisse passer et la question n'est jamais posée.
 */
const TOKEN_KEY = 'timeline.adminToken';

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function askToken(): string | null {
  const token = window.prompt(i18n.t('admin.tokenPrompt'))?.trim() || null;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // stockage indisponible : le jeton ne vaudra que pour cette requête
  }
  return token;
}

function send(path: string, init: RequestInit | undefined, token: string | null): Promise<Response> {
  const headers: Record<string, string> = {};
  if (init?.body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(`${BASE}${path}`, { ...init, headers });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await send(path, init, readToken());
  if (res.status === 401) {
    const token = askToken();
    if (token) res = await send(path, init, token);
  }

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

/** Le schéma ne change pas d'un rendu à l'autre : une seule requête pour toute la session. */
let schemaPromise: Promise<ResourceSchema[]> | null = null;

export const api = {
  schema(): Promise<ResourceSchema[]> {
    schemaPromise ??= request<{ resources: ResourceSchema[] }>('/schema').then((r) => r.resources);
    return schemaPromise;
  },

  stats: () => request<Stat[]>('/stats'),

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
