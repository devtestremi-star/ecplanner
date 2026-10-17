# Setup technique

## Démarrer

```bash
npm install
npm run services:up          # postgres 55432, redis 56379
cp .env.example .env         # puis renseigner WCL_CLIENT_ID / WCL_CLIENT_SECRET

npm run -w @timeline/db check       # Postgres + entités + DDL
npm run -w @timeline/worker check   # Redis + BullMQ + idempotence
npm run -w @timeline/api dev        # http://localhost:3000/api/health
npm run -w @timeline/web dev        # http://localhost:5173
npx tsc -b                          # typecheck du monorepo
```

## Contraintes de versions, et pourquoi

| Choix | Raison |
|---|---|
| **Node 22** | Cible Vercel : Node 20 est en fin de vie depuis avril 2026. MikroORM 6 tourne dessus (build et API testés en 22.23). |
| **MikroORM 6.6.16** (épinglé `~`) | La v7 exige `node >= 22.17.0`. Voir `MIKROORM-V6.md`. |
| **`@mikro-orm/nestjs` 6.1.2** | La 7.0.2 exige core v7 et Node 22.17. |
| **TypeScript 5.9.3** (et non 7.0.2) | `@swc-node/register` déclare `typescript < 7`. La ligne 7 est le portage natif, l'écosystème ne suit pas encore. |
| **SWC comme runner dev, pas tsx** | esbuild n'émet pas `design:paramtypes` — sans quoi l'injection Nest et les décorateurs MikroORM échouent à l'exécution. |

## Pièges rencontrés à l'installation

**Types explicites dans chaque décorateur MikroORM.** `@Property({ type: 'string' })`, jamais
l'inférence. Elle dépend de `emitDecoratorMetadata`, que tous les runners n'émettent pas.

**PK non auto-incrémentées.** `@PrimaryKey({ type: 'integer', autoincrement: false })` — les ids
sont ceux de Blizzard. Sans le flag, MikroORM génère `serial`.

**BullMQ refuse `:` dans un `jobId`.** `Error: Custom Id cannot contain :`. Séparateur `-`.

**`worker.close(true)` ne rend jamais la main** en BullMQ 6.1.2. Utiliser `close()`.

**Passer des options de connexion à BullMQ, pas une instance ioredis.** Il ne ferme que les
connexions qu'il a créées ; sinon le process ne se termine pas.

**Ports 5432 et 6379 déjà pris** sur cette machine — d'où 55432 et 56379 côté hôte.

## Déploiement (Vercel Hobby + Neon Free)

Coût : 0 $. Le front est servi en statique, toute l'API passe par une seule fonction
(`api/index.js`), qui charge le `dist` compilé par `tsc -b`.

1. **Base** : créer un projet Neon Free et récupérer l'URL **poolée** (hôte en `-pooler`).
   Créer le schéma et le référentiel depuis la machine locale — une variable déjà définie
   l'emporte sur `--env-file` :
   ```bash
   DATABASE_URL='postgresql://…-pooler…/neondb?sslmode=require' npm run -w @timeline/db schema:create
   DATABASE_URL='…' npm run -w @timeline/db seed
   ```
2. **Projet Vercel** : importer le dépôt (ou `npx vercel deploy`). `vercel.json` porte le
   build, les rewrites et le cron ; rien à régler dans le dashboard côté build.
3. **Variables d'environnement** (dashboard Vercel) :
   `DATABASE_URL`, `WCL_CLIENT_ID`, `WCL_CLIENT_SECRET`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `CRON_SECRET`,
   et optionnellement `PURGE_MAX_RUNS` (27 000 par défaut).
4. **Vérifier** : `/api/health` doit répondre `{"db":"up"}`.

| Point | Comportement |
|---|---|
| `/api/admin` | Connexion par mot de passe (`ADMIN_PASSWORD`) sur `/admin`, qui pose un cookie de session `HttpOnly`, `Secure`, `SameSite=Strict`, signé avec `ADMIN_SESSION_SECRET`, valable 7 jours. 5 échecs par IP en 15 min bloquent (compteur par instance). Sans ces deux variables : ouvert en local, **404** une fois déployé. `npm run dev:api:neon` lance aussi l'API locale sur la base Neon. |
| `/api/cron/purge` | Appelé chaque jour par Vercel. Au-delà de `PURGE_MAX_RUNS` runs, supprime la moitié la plus ancienne (`scanned_at`). Seuil en NOMBRE de runs : un DELETE ne réduit pas `pg_database_size()`. |
| Pool | Sur Vercel (`VERCEL=1`), 2 connexions max par instance ; c'est le pooler Neon qui mutualise. |
| Migrations | `packages/db/src/migrations/`. À appliquer sur Neon après chaque ajout : `DATABASE_URL='<url non poolée>' npm run -w @timeline/db migration:up`. Une correction de données va AUSSI dans le JSON du seed, qui reste la source de vérité. |
