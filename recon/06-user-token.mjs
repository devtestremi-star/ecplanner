// Phase 0, point 9 : flow authorization code + comparaison des budgets de points.
//
// « Le budget de points sous token utilisateur est-il distinct de celui du client
//   credentials ? Cette réponse détermine s'il faut construire un système de quotas
//   par utilisateur. » (§2.2.5)
//
// Prérequis : déclarer http://localhost:4477/callback comme Redirect URI du client OAuth
// sur https://www.warcraftlogs.com/api/clients/

import { createServer } from 'node:http';
import { gql, dump, primeRateLimit } from './wcl.mjs';

const PORT = 4477;
const REDIRECT_URI = process.env.WCL_REDIRECT_URI ?? `http://localhost:${PORT}/callback`;
const USER_URL = 'https://www.warcraftlogs.com/api/v2/user';

const id = process.env.WCL_CLIENT_ID;
const secret = process.env.WCL_CLIENT_SECRET;
if (!id || !secret) throw new Error('WCL_CLIENT_ID / WCL_CLIENT_SECRET absents.');

// 1. Budget vu par le client credentials, AVANT tout appel utilisateur.
const clientRate = await primeRateLimit();
console.log(`[client credentials] ${clientRate.pointsSpentThisHour}/${clientRate.limitPerHour}, reset dans ${clientRate.pointsResetIn}s`);

// 2. Récupérer un code d'autorisation via un mini-serveur local.
const state = Math.abs(process.hrtime.bigint() % 1000000000n).toString(36);
const authUrl = new URL('https://www.warcraftlogs.com/oauth/authorize');
authUrl.searchParams.set('client_id', id);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('state', state);

console.log(`\nOuvre cette URL dans un navigateur :\n\n  ${authUrl}\n`);
console.log(`En attente du callback sur ${REDIRECT_URI} …`);

const code = await new Promise((resolve, reject) => {
  const server = createServer((req, res) => {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    if (u.pathname !== '/callback') {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    const got = u.searchParams.get('code');
    if (!got) {
      res.end(`Erreur: ${u.searchParams.get('error') ?? 'code absent'}`);
      server.close();
      reject(new Error(u.searchParams.get('error') ?? 'code absent'));
      return;
    }
    if (u.searchParams.get('state') !== state) {
      res.end('state invalide');
      server.close();
      reject(new Error('state invalide'));
      return;
    }
    res.end('OK — tu peux fermer cet onglet.');
    server.close();
    resolve(got);
  });
  server.listen(PORT);
  setTimeout(() => {
    server.close();
    reject(new Error('Timeout: aucun callback en 300s'));
  }, 300_000).unref();
});

// 3. Échanger le code contre un token utilisateur.
const tokenRes = await fetch('https://www.warcraftlogs.com/oauth/token', {
  method: 'POST',
  headers: {
    Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
  }),
});
if (!tokenRes.ok) throw new Error(`Token exchange ${tokenRes.status}: ${await tokenRes.text()}`);
const tok = await tokenRes.json();
console.log(`\nToken utilisateur obtenu (expire dans ${tok.expires_in}s, refresh_token ${tok.refresh_token ? 'présent' : 'ABSENT'}).`);

// 4. Interroger l'endpoint /user et lire SON rateLimitData.
async function userQuery(query) {
  const res = await fetch(USER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors, null, 2));
  return body.data;
}

const me = await userQuery(`{
  userData { currentUser { id name } }
  rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn }
}`);

console.log(`\nUtilisateur: ${me.userData?.currentUser?.name} (id ${me.userData?.currentUser?.id})`);
console.log(`[token utilisateur] ${me.rateLimitData.pointsSpentThisHour}/${me.rateLimitData.limitPerHour}, reset dans ${me.rateLimitData.pointsResetIn}s`);

// 5. Verdict.
const clientAfter = await primeRateLimit();
const same =
  Math.abs(me.rateLimitData.pointsSpentThisHour - clientAfter.pointsSpentThisHour) < 1 &&
  me.rateLimitData.limitPerHour === clientAfter.limitPerHour;

console.log(`\n=== VERDICT (§2.2.5) ===`);
console.log(
  same
    ? 'Budgets ALIGNÉS → probablement le même pot. Un quota applicatif par utilisateur (§4.6.3) devient obligatoire.'
    : 'Budgets DISTINCTS → le token utilisateur a son propre pot. Faire porter le coût au demandeur devient possible.'
);
console.log('(Vérification plus solide : brûler ~50 points côté client, relire les deux compteurs.)');

await dump('06-user-token', {
  clientBefore: clientRate,
  clientAfter,
  user: me.rateLimitData,
  currentUser: me.userData?.currentUser,
  hasRefreshToken: Boolean(tok.refresh_token),
  expiresIn: tok.expires_in,
});
