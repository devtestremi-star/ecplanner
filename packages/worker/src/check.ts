// Fumigation : Redis répond, une file BullMQ accepte un job, un worker le consomme,
// et le process se termine tout seul.
import { Queue, Worker, type Job } from 'bullmq';
import { bullConnection, createRedis } from './redis.js';

const ping = createRedis();
console.log('✅ Redis :', await ping.ping());
await ping.quit();

const QUEUE = 'smoke';
const queue = new Queue(QUEUE, { connection: bullConnection });
await queue.obliterate({ force: true }).catch(() => {});

const worker = new Worker<{ reportCode: string }>(
  QUEUE,
  async (job) => ({ echo: job.data.reportCode }),
  { connection: bullConnection },
);

const done = new Promise<Job>((resolve, reject) => {
  worker.on('completed', resolve);
  worker.on('failed', (_j, err) => reject(err));
  setTimeout(() => reject(new Error('timeout 15s : aucun job consommé')), 15_000).unref();
});

// jobId explicite = idempotence gratuite (plan §4.2).
// ⚠️ BullMQ v6 REFUSE le ':' dans un jobId personnalisé — séparateur '-'.
const id = 'TaqLH6KvWAG3XVP8-3';
const payload = { reportCode: 'TaqLH6KvWAG3XVP8', fightID: 3 };
await queue.add('scan-run', payload, { jobId: id });
const dup = await queue.add('scan-run', payload, { jobId: id });

const job = await done;
console.log('✅ BullMQ : job', job.id, '→', JSON.stringify(job.returnvalue));
console.log('✅ Idempotence :', dup.id === id ? 'le doublon réutilise le même jobId' : '⚠️ ids différents');

// ⚠️ close() et non close(true) : l'arrêt forcé ne rend jamais la main en BullMQ 6.1.2.
await worker.close();
await queue.obliterate({ force: true });
await queue.close();
console.log('✅ Arrêt propre, aucun handle résiduel');
