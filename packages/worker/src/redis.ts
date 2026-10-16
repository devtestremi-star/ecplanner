import type { RedisOptions } from 'ioredis';
import IORedis from 'ioredis';

const url = process.env.REDIS_URL;
if (!url) throw new Error('REDIS_URL absent — copier .env.example vers .env');

/**
 * BullMQ impose `maxRetriesPerRequest: null` : sans ça, ioredis abandonne une commande
 * bloquante après quelques essais et le worker perd des jobs en silence.
 */
export const redisOptions: RedisOptions & { url: string } = {
  url,
  maxRetriesPerRequest: null,
};

/**
 * Passer ces OPTIONS à BullMQ, pas une instance : BullMQ ne ferme que les connexions
 * qu'il a créées lui-même. Lui donner une instance laisse des handles ouverts et le
 * process ne se termine jamais.
 */
export const bullConnection = { url, maxRetriesPerRequest: null } as const;

/** Instance dédiée, à fermer soi-même — pour les usages hors BullMQ (locks, cache). */
export const createRedis = (): IORedis => new IORedis(url, { maxRetriesPerRequest: null });
