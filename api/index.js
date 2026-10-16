/**
 * Fonction Vercel : toute requête `/api/*` arrive ici (cf. rewrites de vercel.json).
 *
 * On importe le `dist` compilé par `tsc -b`, pas les sources : le bundler de Vercel
 * n'émettrait pas `design:paramtypes`, et l'injection Nest casserait à l'exécution.
 *
 * L'app est construite une fois par instance puis réutilisée d'une requête à l'autre.
 */
import { createApp } from '../packages/api/dist/app.js';

let server = null;

async function getServer() {
  server ??= (async () => {
    const app = await createApp();
    await app.init();
    const fastify = app.getHttpAdapter().getInstance();
    await fastify.ready();
    return fastify.server;
  })().catch((err) => {
    // Un démarrage raté (base injoignable…) ne doit pas condamner l'instance entière.
    server = null;
    throw err;
  });
  return server;
}

export default async function handler(req, res) {
  (await getServer()).emit('request', req, res);
}
