import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isDeployed } from '../auth.js';

/**
 * Session d'admin : un mot de passe (`ADMIN_PASSWORD`) échangé contre un cookie signé.
 *
 * Le cookie vaut `<expiration ms>.<HMAC-SHA256 de l'expiration>` avec `ADMIN_SESSION_SECRET`.
 * Rien d'autre à stocker côté serveur : la signature prouve qu'on l'a émis, l'expiration
 * qu'il est encore valable. Changer le secret déconnecte tout le monde.
 *
 * `HttpOnly` : aucun script de la page ne peut le lire, une faille XSS ne le vole pas.
 * `SameSite=Strict` : jamais envoyé depuis un autre site, ce qui ferme le CSRF.
 * `Path=/api/admin` : il ne voyage qu'avec les requêtes d'admin.
 */
export const SESSION_COOKIE = 'ecp_admin';
export const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;

export type AdminAuthMode =
  /** Local sans mot de passe : ouvert, pour ne pas gêner le dev. */
  | 'open'
  /** Mot de passe et secret configurés : session exigée. */
  | 'password'
  /** Déployé sans configuration complète : fermé. Un oubli doit verrouiller, pas exposer. */
  | 'disabled';

export function authMode(): AdminAuthMode {
  const configured = Boolean(process.env.ADMIN_PASSWORD) && Boolean(process.env.ADMIN_SESSION_SECRET);
  if (configured) return 'password';
  return isDeployed() ? 'disabled' : 'open';
}

const sign = (payload: string): string =>
  createHmac('sha256', process.env.ADMIN_SESSION_SECRET ?? '').update(payload).digest('base64url');

/** Comparaison en temps constant, longueurs comprises : on compare des empreintes de même taille. */
const sameSecret = (a: string, b: string): boolean =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

export const passwordMatches = (given: string): boolean =>
  sameSecret(given, process.env.ADMIN_PASSWORD ?? '');

export function issueToken(now = Date.now()): string {
  const exp = String(now + SESSION_TTL_MS);
  return `${exp}.${sign(exp)}`;
}

export function tokenValid(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) <= now) return false;
  return sameSecret(sig, sign(exp));
}

/** Lecture du cookie sans dépendance : l'en-tête `Cookie` est une liste `nom=valeur; …`. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function sessionCookie(token: string | null): string {
  const attrs = [
    `${SESSION_COOKIE}=${token ? encodeURIComponent(token) : ''}`,
    'Path=/api/admin',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${token ? Math.floor(SESSION_TTL_MS / 1000) : 0}`,
  ];
  // `Secure` en ligne seulement : en local, http://localhost ne le renverrait pas.
  if (isDeployed()) attrs.push('Secure');
  return attrs.join('; ');
}

/**
 * Freins aux essais de mot de passe : 5 échecs par IP sur 15 minutes, puis refus.
 *
 * ⚠️ En mémoire, donc PAR instance : sur Vercel chaque instance a son compteur et une
 * instance froide repart à zéro. C'est un ralentisseur, pas un rempart — la vraie défense
 * reste un mot de passe long et aléatoire.
 */
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, number[]>();

export function tooManyFailures(ip: string, now = Date.now()): boolean {
  const recent = (failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(ip, recent);
  return recent.length >= MAX_FAILURES;
}

export function recordFailure(ip: string, now = Date.now()): void {
  failures.set(ip, [...(failures.get(ip) ?? []), now]);
}
