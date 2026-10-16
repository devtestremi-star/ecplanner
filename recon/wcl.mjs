// Harnais de reconnaissance — Phase 0. Code jetable, pas de code de production.
// Aucune dépendance : Node 20 fournit fetch et --env-file.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
export const DUMP_DIR = join(ROOT, 'dumps');

const TOKEN_URL = 'https://www.warcraftlogs.com/oauth/token';
const CLIENT_URL = 'https://www.warcraftlogs.com/api/v2/client';

let cachedToken = null;

async function getToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const id = process.env.WCL_CLIENT_ID;
  const secret = process.env.WCL_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error(
      'WCL_CLIENT_ID / WCL_CLIENT_SECRET absents. ' +
        'Crée recon/.env depuis recon/.env.example et lance avec --env-file=recon/.env'
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });

  if (!res.ok) {
    throw new Error(`OAuth ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.value;
}

// Le plan (§4.1, §4.4) impose rateLimitData sur *chaque* requête, pas une fois par job.
// On l'injecte ici pour que ce soit structurellement impossible de l'oublier.
const RATE_LIMIT_FRAGMENT = 'rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn }';

function injectRateLimit(query) {
  if (query.includes('rateLimitData')) return query;
  const open = query.indexOf('{');
  const close = query.lastIndexOf('}');
  if (open === -1 || close === -1) throw new Error('Query illisible');
  return query.slice(0, close) + '\n  ' + RATE_LIMIT_FRAGMENT + '\n' + query.slice(close);
}

let lastPointsSpent = null;

/**
 * Exécute une query GraphQL. Retourne { data, rate, cost }.
 * `cost` = delta de pointsSpentThisHour depuis la requête précédente de ce process.
 * C'est la seule mesure fiable du coût (§8.2 : « cette mesure remplace toutes les suppositions »).
 */
export async function gql(query, variables = {}) {
  // Sans compteur de départ, le coût de la première requête est non mesurable.
  // On amorce automatiquement plutôt que de compter sur la discipline de l'appelant.
  if (lastPointsSpent === null && !query.includes('__typename')) {
    await primeRateLimit();
  }
  const token = await getToken();
  const res = await fetch(CLIENT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: injectRateLimit(query), variables }),
  });

  const body = await res.json();

  if (body.errors) {
    throw new Error('GraphQL errors:\n' + JSON.stringify(body.errors, null, 2));
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
  }

  const rate = body.data?.rateLimitData ?? null;
  const cost = rate && lastPointsSpent !== null ? rate.pointsSpentThisHour - lastPointsSpent : null;
  if (rate) lastPointsSpent = rate.pointsSpentThisHour;

  return { data: body.data, rate, cost };
}

/** Amorce le compteur de points sans consommer de données. */
export async function primeRateLimit() {
  const { rate } = await gql('{ __typename }');
  return rate;
}

export function logRate(label, rate, cost) {
  if (!rate) return;
  const pct = ((rate.pointsSpentThisHour / rate.limitPerHour) * 100).toFixed(1);
  const costStr = cost === null ? '?' : cost.toFixed(2);
  console.log(
    `  [points] ${label}: coût ${costStr} | ${rate.pointsSpentThisHour.toFixed(2)}/${rate.limitPerHour} (${pct}%) | reset dans ${rate.pointsResetIn}s`
  );
}

export async function dump(name, payload) {
  await mkdir(DUMP_DIR, { recursive: true });
  const path = join(DUMP_DIR, `${name}.json`);
  await writeFile(path, JSON.stringify(payload, null, 2));
  console.log(`  → dumps/${name}.json`);
  return path;
}

/**
 * Parse une URL WCL (§4.7) : ?fight=N, #fight=N, fight=last, ou URL nue.
 * Accepte aussi un code de rapport brut.
 */
export function parseReportUrl(input) {
  if (/^[a-zA-Z0-9]{16}$/.test(input)) return { reportCode: input, fight: null };

  const url = new URL(input);
  const m = url.pathname.match(/\/reports\/([a-zA-Z0-9]+)/);
  if (!m) throw new Error(`URL WCL non reconnue: ${input}`);

  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const raw = url.searchParams.get('fight') ?? hashParams.get('fight');
  const source = url.searchParams.get('source') ?? hashParams.get('source');

  let fight = null;
  if (raw === 'last') fight = 'last';
  else if (raw !== null && /^\d+$/.test(raw)) fight = Number(raw);
  else if (raw !== null) throw new Error(`Paramètre fight non géré: ${raw}`);

  return { reportCode: m[1], fight, source: source ? Number(source) : null };
}

/** Point d'entrée commun aux scripts d'étape : lit l'URL/le code en argv. */
export function requireTarget() {
  const arg = process.argv[2] ?? process.env.WCL_TEST_REPORT;
  if (!arg) {
    console.error('Usage: node --env-file=recon/.env recon/<script>.mjs <url-ou-code-wcl>');
    console.error('   ou : définir WCL_TEST_REPORT dans recon/.env');
    process.exit(1);
  }
  return parseReportUrl(arg);
}
