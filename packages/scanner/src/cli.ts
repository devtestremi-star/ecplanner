/** Scan d'une run, en direct — pour valider le pipeline avant de le mettre en file. */
import 'reflect-metadata';
import { MikroORM } from '@mikro-orm/postgresql';
import ormConfig from '@timeline/db/mikro-orm.config';
import { parseRunUrl, WclClient } from '@timeline/wcl';
import { scanRun } from './index.js';

const input = process.argv[2];
if (!input) {
  console.error('Usage: npm run -w @timeline/worker scan -- "<url wcl avec ?fight=N>"');
  process.exit(1);
}
const { reportCode, fight } = parseRunUrl(input);

const clientId = process.env.WCL_CLIENT_ID;
const clientSecret = process.env.WCL_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error('WCL_CLIENT_ID / WCL_CLIENT_SECRET absents');

const orm = await MikroORM.init(ormConfig);
const client = new WclClient({ credentials: { clientId, clientSecret } });
// Amorce le compteur : sans solde de départ, le coût du scan n'est pas mesurable.
await client.query('{ __typename }');

const t0 = Date.now();
const res = await scanRun(orm.em.fork(), client, reportCode, fight);
console.log(`\n✅ ${res.reportCode} fight ${res.fightID} — ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`   boss           : ${res.bosses}`);
console.log(`   participants   : ${res.participants}`);
console.log(`   events stockés : ${res.eventsStored}`);
console.log(`   events écartés : ${res.eventsDropped} (hors fenêtre de boss)`);
console.log(`   points WCL     : ${res.pointsSpent?.toFixed(2) ?? '?'}`);
for (const w of res.warnings) console.log(`   • ${w}`);
await orm.close();
