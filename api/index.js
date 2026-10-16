/**
 * Fonction Vercel : toute requête `/api/*` arrive ici (cf. rewrites de vercel.json).
 *
 * On importe le `dist` compilé par `tsc -b`, pas les sources : le bundler de Vercel
 * n'émettrait pas `design:paramtypes`, et l'injection Nest casserait à l'exécution.
 *
 * L'app est construite une fois par instance puis réutilisée d'une requête à l'autre.
 */
let server = null;

async function getServer() {
  server ??= (async () => {
    // Import dynamique : la config jette dès le chargement si une variable manque, et
    // un import statique ferait planter le module avant que `handler` puisse répondre.
    const { createApp } = await import('../packages/api/dist/app.js');
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
  let srv;
  try {
    srv = await getServer();
  } catch (err) {
    // Le détail (variable manquante, base injoignable…) va dans les logs Vercel, pas au client.
    console.error('Démarrage de l’API impossible :', err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ status: 'error', message: 'API indisponible — voir les logs de la fonction' }));
    return;
  }
  srv.emit('request', req, res);
}
