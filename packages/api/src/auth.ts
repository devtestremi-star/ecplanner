import { timingSafeEqual } from 'node:crypto';

/** Compare `Authorization: Bearer <secret>` en temps constant. */
export function bearerMatches(header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Vercel définit `VERCEL=1` à l'exécution : c'est le seul signal fiable d'un déploiement. */
export const isDeployed = (): boolean => process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
