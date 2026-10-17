import { UnderscoreNamingStrategy } from '@mikro-orm/core';
import { Migrator } from '@mikro-orm/migrations';
import { defineConfig } from '@mikro-orm/postgresql';
import {
  Boss, Dungeon, DungeonSeason, ImportBatch, ImportCandidate, ScanJob,
  ScannedBoss, ScannedRun, Season, Spell, SpellAlias, SpellSpec, TraitEntry,
} from './entities/index.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL absent — copier .env.example vers .env');

/** Fonction Vercel : beaucoup d'instances éphémères, chacune avec son propre pool. */
const serverless = process.env.VERCEL === '1';

/**
 * MikroORM découpe `clientUrl` en hôte/utilisateur/base et JETTE la query string : un
 * `?sslmode=require` n'atteint jamais pg, qui se connecte en clair — et Neon refuse
 * (« connection is insecure »). On le traduit donc en option explicite.
 */
const ssl = /[?&]sslmode=(require|verify-ca|verify-full)\b/.test(url);

export default defineConfig({
  clientUrl: url,
  ...(ssl && { driverOptions: { connection: { ssl: true } } }),
  ...(serverless && {
    // Une instance ne traite qu'une poignée de requêtes à la fois ; c'est le pooler Neon
    // (URL `-pooler`) qui mutualise. min 0 : ne rien garder ouvert quand l'instance dort.
    pool: { min: 0, max: 2, idleTimeoutMillis: 10_000 },
    // Évite une requête `pg_database` à chaque démarrage à froid : la base existe.
    ensureDatabase: false,
  }),
  entities: [
    Season, Dungeon, DungeonSeason, Boss,
    Spell, SpellAlias, SpellSpec, TraitEntry,
    ScannedRun, ScannedBoss, ScanJob,
    ImportBatch, ImportCandidate,
  ],
  // Pas de metadataProvider par réflexion : chaque décorateur porte son `type`.
  // esbuild (donc tsx) n'émet pas design:type — l'inférence serait un piège en dev.
  extensions: [Migrator],
  migrations: { path: './dist/migrations', pathTs: './src/migrations', snapshot: false },
  // snake_case en base, camelCase en TS
  namingStrategy: UnderscoreNamingStrategy,
  debug: process.env.MIKRO_ORM_DEBUG === '1',
});
